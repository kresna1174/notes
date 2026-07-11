import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/ask-agent/')({
  beforeLoad: () => {
    throw redirect({ to: '/documents' })
  },
  component: () => null,
})
