import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useFocusTrap } from '@/lib/use-focus-trap'

function TestDialog({ onClose }: { onClose: () => void }) {
  const ref = useFocusTrap(onClose)

  return (
    <div ref={ref}>
      <button type="button">Close</button>
      <input aria-label="Name" />
    </div>
  )
}

describe('useFocusTrap', () => {
  it('does not steal focus back to the first control on rerender', () => {
    const { rerender, getByRole, getByLabelText } = render(<TestDialog onClose={() => {}} />)

    const closeButton = getByRole('button', { name: 'Close' })
    const input = getByLabelText('Name') as HTMLInputElement

    expect(closeButton).toHaveFocus()

    input.focus()
    expect(input).toHaveFocus()

    rerender(<TestDialog onClose={() => {}} />)

    expect(input).toHaveFocus()
  })

  it('uses the latest onClose handler for Escape', () => {
    const first = vi.fn()
    const second = vi.fn()

    const { rerender } = render(<TestDialog onClose={first} />)
    rerender(<TestDialog onClose={second} />)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
