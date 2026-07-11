import re
import math
from collections import Counter
import os
import logging
from openai import AsyncOpenAI
import chromadb

logger = logging.getLogger("ai-agent")

# Common Indonesian and English stop words to filter out from search queries
STOP_WORDS = {
    # English
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'by', 'for', 'with', 'about', 
    'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 
    'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 
    'there', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 
    'should', 'now', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    # Indonesian
    'yang', 'di', 'ke', 'dari', 'pada', 'dalam', 'untuk', 'dengan', 'dan', 'atau', 'tapi', 'tetapi', 'jika',
    'maka', 'karena', 'oleh', 'sebab', 'sangat', 'secara', 'adalah', 'yaitu', 'yakni', 'seperti', 'sebagai',
    'ada', 'adalah', 'bagi', 'baru', 'banyak', 'beberapa', 'belum', 'bisa', 'dapat', 'dia', 'kami', 'kita',
    'mereka', 'saya', 'kamu', 'anda', 'kalian', 'ini', 'itu', 'juga', 'hanya', 'lagi', 'telah', 'sudah', 'akan'
}

def tokenize(text: str) -> list[str]:
    """Tokenize text into a list of lowercase alphanumeric words."""
    return re.findall(r'\w+', text.lower())


# ── Sparse Search Engine (Local BM25) ───────────────────────────────────────

class BM25Retriever:
    def __init__(self, chunks: list[str], k1: float = 1.5, b: float = 0.75):
        self.chunks = chunks
        self.k1 = k1
        self.b = b
        self.corpus_size = len(chunks)
        
        self.doc_lengths = []
        self.doc_term_freqs = []
        self.df = Counter()
        
        for chunk in chunks:
            tokens = tokenize(chunk)
            self.doc_lengths.append(len(tokens))
            
            tf = Counter(tokens)
            self.doc_term_freqs.append(tf)
            
            for term in tf.keys():
                self.df[term] += 1
                
        self.avg_doc_length = sum(self.doc_lengths) / self.corpus_size if self.corpus_size > 0 else 0
        
        self.idf = {}
        for term, freq in self.df.items():
            self.idf[term] = math.log((self.corpus_size - freq + 0.5) / (freq + 0.5) + 1.0)

    def get_scores(self, query: str) -> list[float]:
        query_tokens = [t for t in tokenize(query) if t not in STOP_WORDS]
        if not query_tokens:
            query_tokens = tokenize(query)
            
        scores = [0.0] * self.corpus_size
        
        for token in query_tokens:
            if token not in self.idf:
                continue
            idf_val = self.idf[token]
            
            for idx in range(self.corpus_size):
                tf = self.doc_term_freqs[idx].get(token, 0)
                doc_len = self.doc_lengths[idx]
                
                num = tf * (self.k1 + 1)
                denom = tf + self.k1 * (1 - self.b + self.b * (doc_len / self.avg_doc_length if self.avg_doc_length > 0 else 1))
                
                scores[idx] += idf_val * (num / denom)
                
        return scores

    def retrieve(self, query: str, top_k: int = 4) -> list[tuple[str, float]]:
        if not self.chunks:
            return []
            
        scores = self.get_scores(query)
        scored_chunks = list(zip(self.chunks, scores))
        scored_chunks.sort(key=lambda x: x[1], reverse=True)
        return scored_chunks[:top_k]


# ── Helper: Text Chunking ────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> list[str]:
    """Split text into overlapping chunks of character counts."""
    chunks = []
    text_len = len(text)
    start = 0
    
    text = re.sub(r'\s+', ' ', text).strip()
    
    while start < text_len:
        end = start + chunk_size
        if end >= text_len:
            chunks.append(text[start:])
            break
            
        boundary = text.rfind('. ', start, end)
        if boundary != -1 and boundary > start + (chunk_size // 2):
            end = boundary + 1
        else:
            boundary = text.rfind(' ', start, end)
            if boundary != -1 and boundary > start + (chunk_size // 2):
                end = boundary
                
        chunks.append(text[start:end].strip())
        start = end - overlap
        
    return [c for c in chunks if len(c) > 20]


# ── Dense Vector Store (ChromaDB & Mistral/OpenAI Embeddings) ────────────────

async def generate_embeddings(chunks: list[str]) -> list[list[float]] | None:
    """Generate dense vector embeddings for a list of text chunks."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        logger.warning("RAG: OPENROUTER_API_KEY not set. Embedding generation skipped.")
        return None

    try:
        client = AsyncOpenAI(
            api_key=api_key,
            base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        )
        
        # Default to Mistral embedding model, fallback to OpenAI if requested
        model = os.getenv("EMBEDDING_MODEL", "mistralai/mistral-embed")
        
        response = await client.embeddings.create(
            input=chunks,
            model=model
        )
        return [item.embedding for item in response.data]
    except Exception as e:
        logger.error(f"RAG: Failed to generate embeddings via API: {e}")
        # Secondary fallback if mistral-embed fails: try standard text-embedding-3-small
        try:
            logger.info("RAG: Retrying with fallback model: openai/text-embedding-3-small")
            client = AsyncOpenAI(
                api_key=api_key,
                base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
            )
            response = await client.embeddings.create(
                input=chunks,
                model="openai/text-embedding-3-small"
            )
            return [item.embedding for item in response.data]
        except Exception as retry_err:
            logger.error(f"RAG: Fallback embedding model also failed: {retry_err}")
            return None

async def generate_query_embedding(query: str) -> list[float] | None:
    """Generate dense vector embedding for a query string."""
    res = await generate_embeddings([query])
    return res[0] if res else None


class ChromaVectorStore:
    def __init__(self, persist_dir: str = "data/chroma_db"):
        self.persist_dir = persist_dir
        os.makedirs(self.persist_dir, exist_ok=True)
        # Initialize persistent ChromaDB client
        self.client = chromadb.PersistentClient(path=self.persist_dir)
        # Create or fetch the document collection
        self.collection = self.client.get_or_create_collection("note_attachments")

    def add_chunks(self, filename: str, file_path: str, session_id: str, chunks: list[str], embeddings: list[list[float]]):
        ids = [f"{session_id}_{file_path}_{idx}" for idx in range(len(chunks))]
        metadatas = [
            {
                "filename": filename,
                "file_path": file_path,
                "session_id": session_id,
                "chunk_index": idx
            }
            for idx in range(len(chunks))
        ]
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas
        )

    async def search(self, filename: str, file_path: str, session_id: str, content: str, query: str, top_k: int = 4) -> list[tuple[str, float]] | None:
        """
        Search for top-k matching chunks in ChromaDB.
        Retrieves matching chunks using Cosine Similarity / Distance on dense embeddings.
        Caches file chunks inside ChromaDB to avoid repeating API embedding calls.
        """
        # 1. Check if we already have chunks for this file indexed in ChromaDB
        results = self.collection.get(
            where={"file_path": file_path}
        )
        
        # 2. If not indexed, generate embeddings and store them in ChromaDB
        if not results or not results.get("ids"):
            chunks = chunk_text(content, chunk_size=800, overlap=150)
            if not chunks:
                return []
                
            embeddings = await generate_embeddings(chunks)
            if not embeddings:
                # Return None to trigger BM25 sparse search fallback
                return None
                
            self.add_chunks(filename, file_path, session_id, chunks, embeddings)
            
        # 3. Generate query embedding
        query_emb = await generate_query_embedding(query)
        if not query_emb:
            return None
            
        # 4. Query ChromaDB collection with query embedding, filtered by file_path
        search_results = self.collection.query(
            query_embeddings=[query_emb],
            n_results=top_k,
            where={"file_path": file_path}
        )
        
        # 5. Format results
        formatted_results = []
        if search_results and search_results.get("documents"):
            documents = search_results["documents"][0]
            # Convert distances to similarity score (Chroma returns L2/cosine distance depending on collection settings)
            distances = search_results.get("distances", [[]])[0]
            for doc, dist in zip(documents, distances):
                score = 1.0 - dist # Cosine similarity score
                formatted_results.append((doc, score))
                
        return formatted_results
