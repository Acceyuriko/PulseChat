import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UserSelect, type SelectableUser } from './UserSelect'

const users: SelectableUser[] = [
  { id: 'user-ada', displayName: 'Ada Lovelace' },
  { id: 'user-grace', displayName: 'Grace Hopper' },
]

describe('UserSelect', () => {
  it('renders the empty option plus one option per user', () => {
    render(<UserSelect users={users} value={null} onChange={vi.fn()} />)

    expect(screen.getByRole('option', { name: '(nobody)' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(users.length + 1)
    expect(screen.getByRole('option', { name: 'Grace Hopper' })).toBeInTheDocument()
  })

  it('reflects the selected identity', () => {
    render(<UserSelect users={users} value="user-grace" onChange={vi.fn()} />)

    expect(screen.getByRole('combobox')).toHaveValue('user-grace')
  })

  it('reports the picked user id', () => {
    const onChange = vi.fn()
    render(<UserSelect users={users} value={null} onChange={onChange} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'user-ada' } })

    expect(onChange).toHaveBeenCalledWith('user-ada')
  })

  it('reports null when the selection is cleared', () => {
    const onChange = vi.fn()
    render(<UserSelect users={users} value="user-ada" onChange={onChange} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith(null)
  })
})
