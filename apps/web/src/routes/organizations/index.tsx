import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/organizations/')({
  beforeLoad: () => {
    throw redirect({ to: '/users' })
  },
  component: () => null,
})
