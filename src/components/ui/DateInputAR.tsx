import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'

/**
 * Input de fecha en formato DD/MM/AAAA, siempre — a diferencia de
 * <input type="date">, cuyo formato de despliegue depende del navegador/SO
 * (en Chrome/Windows suele mostrarse MM/DD/AAAA sin importar el lang de la
 * página). Recibe y emite fecha en ISO (YYYY-MM-DD) para no tocar el resto
 * del código, que ya trabaja en ISO.
 */

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

function digitsToIso(digits: string): string {
  if (digits.length !== 8) return ''
  const d = digits.slice(0, 2)
  const m = digits.slice(2, 4)
  const y = digits.slice(4, 8)
  const day = Number(d)
  const month = Number(m)
  const year = Number(y)
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  const dt = new Date(year, month - 1, day)
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return ''
  return `${y}-${m}-${d}`
}

function formatDigits(digits: string): string {
  const d = digits.slice(0, 2)
  const m = digits.slice(2, 4)
  const y = digits.slice(4, 8)
  let out = d
  if (m) out += '/' + m
  if (y) out += '/' + y
  return out
}

interface DateInputARProps {
  value: string
  onChange: (isoValue: string) => void
  required?: boolean
  className?: string
  style?: CSSProperties
  id?: string
}

export function DateInputAR({ value, onChange, required, className, style, id }: DateInputARProps) {
  const [text, setText] = useState(() => isoToDisplay(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(isoToDisplay(value))
  }, [value])

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    setText(formatDigits(digits))
    onChange(digitsToIso(digits))
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder="DD/MM/AAAA"
      maxLength={10}
      className={className ?? 'rc-input'}
      style={style}
      value={text}
      onChange={handleChange}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        setText(isoToDisplay(value))
      }}
      required={required}
    />
  )
}
