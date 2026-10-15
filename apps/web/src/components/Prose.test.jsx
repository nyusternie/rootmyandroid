// apps/web/src/components/Prose.test.jsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Prose } from '@/components/Prose'

describe('Prose', () => {
  it('renders children inside a div by default', () => {
    render(<Prose>hello world</Prose>)
    const el = screen.getByText('hello world')
    expect(el.tagName).toBe('DIV')
    expect(el).toHaveClass('prose')
  })

  it('supports rendering as a different element', () => {
    render(<Prose as="article">article body</Prose>)
    expect(screen.getByText('article body').tagName).toBe('ARTICLE')
  })

  it('preserves a custom className alongside prose classes', () => {
    render(<Prose className="custom-class">content</Prose>)
    const el = screen.getByText('content')
    expect(el).toHaveClass('custom-class')
    expect(el).toHaveClass('prose')
  })
})
