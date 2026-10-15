// apps/web/src/components/Button.test.jsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/Button'

describe('Button', () => {
  it('renders a <button> when no href is provided', () => {
    render(<Button>Click me</Button>)
    const button = screen.getByRole('button', { name: 'Click me' })
    expect(button).toBeInTheDocument()
    expect(button.tagName).toBe('BUTTON')
  })

  it('renders a link when href is provided', () => {
    render(<Button href="/docs/installation">Get started</Button>)
    const link = screen.getByRole('link', { name: 'Get started' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/docs/installation')
  })

  it('applies the primary variant styles by default', () => {
    render(<Button>Primary</Button>)
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass(
      'bg-sky-300'
    )
  })

  it('applies the secondary variant styles when requested', () => {
    render(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveClass(
      'bg-slate-800'
    )
  })

  it('merges additional className values', () => {
    render(<Button className="mt-4">Styled</Button>)
    const button = screen.getByRole('button', { name: 'Styled' })
    expect(button).toHaveClass('mt-4')
    expect(button).toHaveClass('bg-sky-300')
  })
})
