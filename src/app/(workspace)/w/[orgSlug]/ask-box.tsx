'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { Icon } from '@/ui/primitives/Icon'
import { Button } from '@/ui/primitives/Button'
import { askAction, type AskState } from './pitanja/actions'
import { useActionState } from 'react'
import styles from './ask-box.module.css'

export interface AskBoxLabels {
  readonly title: string
  readonly placeholder: string
  readonly open: string
  readonly none: string
}

/**
 * Polje za pitanje na početnom ekranu.
 *
 * Stoji ovde, a ne samo na svojoj stranici, zato što je najveći deo vrednosti u
 * pitanjima kojih se rukovodilac ne bi setio. Prazno polje na drugom ekranu
 * traži da prvo pomisli da pita; ponuđeno pitanje ispod brojeva koje upravo
 * gleda ne traži ništa.
 *
 * Predlozi su IZVEDENI IZ PODATAKA i stižu gotovi sa servera — kada
 * potraživanja pređu prag, prvo pitanje je ko najviše duguje. Klik na predlog
 * ne šalje ga odmah nego ga UPISUJE u polje: pitanje se često dotera pre slanja,
 * a trenutno slanje bi tu priliku oduzelo.
 */
export function AskBox({
  orgSlug,
  suggestions,
  labels,
}: {
  orgSlug: string
  suggestions: readonly string[]
  labels: AskBoxLabels
}) {
  const [state, action, pending] = useActionState<AskState, FormData>(askAction, {})
  const [text, setText] = useState('')

  return (
    <section className={styles.box}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <Icon name="ask" size={17} />
          {labels.title}
        </h2>
        <Link href={`/w/${orgSlug}/pitanja` as Route} className={styles.open}>
          {labels.open} →
        </Link>
      </div>

      <form action={action} className={styles.form}>
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input
          type="text"
          name="question"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={labels.placeholder}
          maxLength={500}
          className={styles.input}
          aria-label={labels.title}
        />
        <Button type="submit" disabled={pending || text.trim() === ''}>
          <Icon name="send" size={15} />
        </Button>
      </form>

      {suggestions.length > 0 ? (
        <ul className={styles.chips}>
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => setText(suggestion)}
                className={styles.chip}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.none}>{labels.none}</p>
      )}

      {state.answered ? (
        <p className={styles.sent}>
          <Link href={`/w/${orgSlug}/pitanja` as Route}>{labels.open} →</Link>
        </p>
      ) : null}
    </section>
  )
}
