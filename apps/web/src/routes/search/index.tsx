import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/search/')({
  beforeLoad: () => {
    throw redirect({ to: '/documents' })
  },
  component: () => null,
})
