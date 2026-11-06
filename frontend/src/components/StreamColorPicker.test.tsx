import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { palette, setStreamColor, streamColor } from '../data/streamColors'
import { StreamColorPicker } from './StreamColorPicker'

it('offers every original palette color and accepts a hex code', () => {
  const id = 'COLOR_PICKER_TEST'
  render(<StreamColorPicker id={id} />)
  expect(screen.getAllByRole('button', { name: new RegExp(`Set ${id} to`) })).toHaveLength(
    palette.length,
  )
  fireEvent.click(screen.getByRole('button', { name: `Set ${id} to ${palette[1]}` }))
  expect(streamColor(id)).toBe(palette[1])
  fireEvent.change(screen.getByLabelText(`Hex color for ${id}`), { target: { value: '#123abc' } })
  fireEvent.blur(screen.getByLabelText(`Hex color for ${id}`))
  expect(streamColor(id)).toBe('#123abc')
  setStreamColor(id, null)
})
