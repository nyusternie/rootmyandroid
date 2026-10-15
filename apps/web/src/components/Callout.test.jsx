// apps/web/src/components/Callout.test.jsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Callout } from '@/components/Callout'

describe('Callout', () => {
  it('renders the title and children', () => {
    render(
      <Callout title="Heads up">
        <p>Some important body text.</p>
      </Callout>
    )
    expect(screen.getByText('Heads up')).toBeInTheDocument()
    expect(screen.getByText('Some important body text.')).toBeInTheDocument()
  })

  it('defaults to the note style', () => {
    render(<Callout title="Note title">body</Callout>)
    expect(screen.getByText('Note title')).toHaveClass('text-sky-900')
  })

  it('applies the warning style when type is warning', () => {
    render(
      <Callout type="warning" title="Warning title">
        body
      </Callout>
    )
    expect(screen.getByText('Warning title')).toHaveClass('text-amber-900')
  })
})
