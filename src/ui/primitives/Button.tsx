import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  block?: boolean
  large?: boolean
}

export function Button({ variant = 'secondary', block, large, className, ...rest }: Props) {
  const classes = [
    styles.button,
    styles[variant],
    block ? styles.block : '',
    large ? styles.large : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return <button className={classes} {...rest} />
}
