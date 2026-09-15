import { NOTE_MAX_LENGTH } from '../notes/limits'

/**
 * Odgovor → tekst beleške.
 *
 * Čista funkcija, pa se skraćivanje može proveriti testom. Skraćivanje je ovde
 * jedina zamka: beleška ima gornju granicu, a odgovor je nema.
 */

export interface NoteSource {
  readonly question: string | null
  readonly answer: string
  /** Datum odgovora, već formatiran uzvodno — ovaj modul ne zna jezik. */
  readonly when: string
}

export interface NoteLabels {
  /** Npr. „Iz razgovora, {when}". */
  readonly header: string
  readonly questionLabel: string
}

/**
 * Sastavljanje beleške.
 *
 * Redosled je pitanje pa odgovor, jer se posle mesec dana traži POVOD. Broj bez
 * pitanja uz sebe je podatak kojem se ne zna svrha.
 *
 * Kada tekst ne staje, skraćuje se ODGOVOR, ne pitanje. Pitanje je kratko i
 * nosi smisao; odsečeno pitanje ostavlja belešku bez povoda, a odsečen odgovor
 * i dalje kaže o čemu je reč.
 */
export function noteFromAnswer(source: NoteSource, labels: NoteLabels): string {
  const head = labels.header.replace('{when}', source.when)

  const question = source.question?.trim()
  const prefix =
    question && question !== ''
      ? `${head}\n${labels.questionLabel} ${question}\n\n`
      : `${head}\n\n`

  const room = NOTE_MAX_LENGTH - prefix.length
  const answer = source.answer.trim()

  // Kada ni zaglavlje ne staje, beleška je sam odgovor. Bolje bez povoda nego
  // bez odgovora.
  if (room < 40) return answer.slice(0, NOTE_MAX_LENGTH)

  if (answer.length <= room) return `${prefix}${answer}`

  // Znak za izostavljeno mora da stane U granicu, pa se oduzima unapred.
  const ellipsis = '…'
  return `${prefix}${answer.slice(0, room - ellipsis.length).trimEnd()}${ellipsis}`
}
