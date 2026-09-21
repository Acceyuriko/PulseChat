import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Composer } from './Composer'

/**
 * The mention dropdown's behaviour in the composer.
 *
 * `mentions.ts` covers the string logic exhaustively; what is left to check here is the wiring — that
 * typing `@` opens the list, that it filters as you type, and that picking a row writes a complete
 * mention into the textarea.
 */

const candidates = [
  { id: 'u-darrell', displayName: 'Darrell Steward', title: 'CTO@Apple', avatarUrl: null },
  { id: 'u-devon', displayName: 'Devon Lane', title: 'VP Engineering@Acme', avatarUrl: null },
]

function renderComposer() {
  const onSend = vi.fn()

  render(
    <Composer candidates={candidates} quoting={null} onDismissQuote={vi.fn()} onSend={onSend} />,
  )

  return { onSend, textarea: screen.getByLabelText<HTMLTextAreaElement>('Message') }
}

/** Types into the textarea the way a user would, so React's onChange runs. */
function type(textarea: HTMLTextAreaElement, value: string) {
  fireEvent.change(textarea, { target: { value } })
}

describe('Composer mention dropdown', () => {
  it('is closed until a mention trigger is typed', () => {
    renderComposer()

    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument()
  })

  it('opens when @ is typed', () => {
    const { textarea } = renderComposer()

    type(textarea, '@')

    expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument()
  })

  it('lists every candidate for an empty term', () => {
    const { textarea } = renderComposer()

    type(textarea, '@')

    expect(screen.getByText('Darrell Steward')).toBeInTheDocument()
    expect(screen.getByText('Devon Lane')).toBeInTheDocument()
  })

  it('shows the title subtitle the design draws', () => {
    const { textarea } = renderComposer()

    type(textarea, '@')

    expect(screen.getByText('CTO@Apple')).toBeInTheDocument()
  })

  it('filters as the term is typed', () => {
    const { textarea } = renderComposer()

    type(textarea, '@Dev')

    expect(screen.getByText('Devon Lane')).toBeInTheDocument()
    expect(screen.queryByText('Darrell Steward')).not.toBeInTheDocument()
  })

  it('matches a surname', () => {
    const { textarea } = renderComposer()

    type(textarea, '@Steward')

    expect(screen.getByText('Darrell Steward')).toBeInTheDocument()
  })

  it('closes when nothing matches', () => {
    const { textarea } = renderComposer()

    type(textarea, '@zzz')

    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument()
  })

  it('closes once whitespace is typed, so a sentence does not keep it open', () => {
    const { textarea } = renderComposer()

    type(textarea, '@Darrell ')

    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument()
  })

  it('does not open on an email-like @ in the middle of a word', () => {
    const { textarea } = renderComposer()

    type(textarea, 'foo@bar')

    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument()
  })

  it('writes a complete mention into the textarea when a row is picked', () => {
    const { textarea } = renderComposer()

    type(textarea, '@Dev')
    fireEvent.mouseDown(screen.getByText('Devon Lane'))

    expect(textarea.value).toBe('[@Devon Lane](mention:u-devon) ')
  })

  it('closes the dropdown after a pick', () => {
    const { textarea } = renderComposer()

    type(textarea, '@Dev')
    fireEvent.mouseDown(screen.getByText('Devon Lane'))

    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument()
  })

  it('sends the composed body', () => {
    const { onSend, textarea } = renderComposer()

    type(textarea, 'hello there')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledWith('hello there')
  })

  it('will not send an empty body', () => {
    const { onSend, textarea } = renderComposer()

    type(textarea, '   ')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends on Enter', () => {
    const { onSend, textarea } = renderComposer()

    type(textarea, 'sent with enter')
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledWith('sent with enter')
  })

  it('does not send on Shift+Enter, which is a newline', () => {
    const { onSend, textarea } = renderComposer()

    type(textarea, 'line one')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('clears the draft after sending', () => {
    const { textarea } = renderComposer()

    type(textarea, 'gone after send')
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(textarea.value).toBe('')
  })
})

describe('Composer toolbar', () => {
  it('renders only the seven actions that need no upload or navigation', () => {
    renderComposer()

    for (const label of [
      'Bold',
      'Italic',
      'Strikethrough',
      'Ordered list',
      'Bullet list',
      'Emoji',
      'Mention someone',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }

    // `file`, `image`, `link` and `more` are deliberately absent: a dead button is worse than none.
    for (const absent of ['Attach file', 'Insert image', 'Add link', 'More options']) {
      expect(screen.queryByRole('button', { name: absent })).not.toBeInTheDocument()
    }
  })

  it('wraps the selection in bold markers', () => {
    const { textarea } = renderComposer()

    type(textarea, 'make me bold')
    textarea.setSelectionRange(8, 12)
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))

    expect(textarea.value).toBe('make me **bold**')
  })

  it('inserts placeholder text when nothing is selected', () => {
    const { textarea } = renderComposer()

    fireEvent.click(screen.getByRole('button', { name: 'Italic' }))

    expect(textarea.value).toBe('*italic*')
  })

  it('prefixes the current line for a list', () => {
    const { textarea } = renderComposer()

    type(textarea, 'first item')
    fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }))

    expect(textarea.value).toBe('- first item')
  })

  it('opens the mention dropdown from the toolbar', () => {
    renderComposer()

    fireEvent.click(screen.getByRole('button', { name: 'Mention someone' }))

    expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument()
  })
})
