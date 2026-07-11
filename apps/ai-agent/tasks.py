import asyncio
from core.celery_app import celery_app
from core.database import AsyncSessionLocal
from core.models import SubAgentTask
from sqlalchemy import select
from agents import Agent, Runner

import core.llm
from core.llm import get_model


async def run_summarize_agent_async(task_id: str, content: str, user_id: str | None = None):
    async with AsyncSessionLocal() as db:
        stmt = select(SubAgentTask).where(SubAgentTask.id == task_id)
        result = await db.execute(stmt)
        task = result.scalar_one_or_none()
        if not task:
            return

        task.status = "running"
        await db.commit()

        try:
            from modules.tools import write_notes, search_web, extract_web, crawl_web
            summarizer_agent = Agent(
                name="SummarizerSubAgent",
                instructions="You are a specialized sub-agent that summarizes note content. Provide a concise, bullet-pointed summary.",
                model=get_model(),
                tools=[write_notes, search_web, extract_web, crawl_web]
            )

            context = {"session_id": task.session_id, "user_id": user_id}
            res = await Runner.run(summarizer_agent, f"Please summarize this note content:\n\n{content}", context=context)

            task.status = "completed"
            task.output_data = res.final_output
            await db.commit()
        except Exception as e:
            task.status = "failed"
            task.output_data = str(e)
            await db.commit()


async def run_tags_agent_async(task_id: str, content: str, user_id: str | None = None):
    async with AsyncSessionLocal() as db:
        stmt = select(SubAgentTask).where(SubAgentTask.id == task_id)
        result = await db.execute(stmt)
        task = result.scalar_one_or_none()
        if not task:
            return

        task.status = "running"
        await db.commit()

        try:
            from modules.tools import write_notes, search_web, extract_web, crawl_web
            tagger_agent = Agent(
                name="TaggerSubAgent",
                instructions="You are a specialized sub-agent that extracts 3 to 5 relevant tags from the content. Return ONLY a comma-separated list of tags.",
                model=get_model(),
                tools=[write_notes, search_web, extract_web, crawl_web]
            )

            context = {"session_id": task.session_id, "user_id": user_id}
            res = await Runner.run(tagger_agent, f"Extract tags for this content:\n\n{content}", context=context)

            task.status = "completed"
            task.output_data = res.final_output
            await db.commit()
        except Exception as e:
            task.status = "failed"
            task.output_data = str(e)
            await db.commit()


# Celery task definitions (synchronous wrappers)

@celery_app.task(name="tasks.summarize_task")
def summarize_task(task_id: str, content: str, user_id: str | None = None):
    asyncio.run(run_summarize_agent_async(task_id, content, user_id))


@celery_app.task(name="tasks.tags_task")
def tags_task(task_id: str, content: str, user_id: str | None = None):
    asyncio.run(run_tags_agent_async(task_id, content, user_id))
