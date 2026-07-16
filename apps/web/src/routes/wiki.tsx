import { createFileRoute } from '@tanstack/react-router'
import WikiViewer from '../modules/wiki/WikiViewer'

export const Route = createFileRoute('/wiki')({
  component: WikiViewer,
})
