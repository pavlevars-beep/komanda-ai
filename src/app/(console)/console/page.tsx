import { userDb } from '@/server/db/user-client'
import { listClientOrganizations } from '@/core/organizations/repository'
import { StatusBadge, DemoBadge, type Tone } from '@/ui/patterns/StatusBadge'
import styles from './overview.module.css'

const STATUS_TONE: Record<string, Tone> = {
  active: 'ok',
  onboarding: 'info',
  prospect: 'neutral',
  suspended: 'warn',
  archived: 'neutral',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktivan',
  onboarding: 'Onboarding',
  prospect: 'U pripremi',
  suspended: 'Suspendovan',
  archived: 'Arhiviran',
}

export default async function ConsoleOverview() {
  const db = await userDb()
  const clients = await listClientOrganizations(db)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Pregled</h1>
        <p className={styles.lede}>Klijentske organizacije koje administrirate.</p>
      </header>

      {!clients.ok ? (
        <p className={styles.empty}>Podaci trenutno nisu dostupni.</p>
      ) : clients.value.length === 0 ? (
        <p className={styles.empty}>
          Nemate nijednu dodeljenu organizaciju. Dodelu vrši Super Admin.
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Kompanija</th>
                <th>Delatnost</th>
                <th>Status</th>
                <th>Plan</th>
              </tr>
            </thead>
            <tbody>
              {clients.value.map((c) => (
                <tr key={c.id}>
                  <td className={styles.name}>
                    <span>{c.display_name}</span>
                    {c.is_demo ? <DemoBadge label="Demo" /> : null}
                  </td>
                  <td className={styles.muted}>{c.industry ?? '—'}</td>
                  <td>
                    <StatusBadge
                      tone={STATUS_TONE[c.status] ?? 'neutral'}
                      label={STATUS_LABEL[c.status] ?? c.status}
                    />
                  </td>
                  <td className={styles.muted}>{c.plan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
        Ostali delovi konzole dolaze u Fazi 2 i 3. Namerno se ne prikazuju
        kao prazne kartice koje izgledaju kao da nešto rade.
      */}
      <section className={styles.pending}>
        <span className={styles.pendingLabel}>Uskoro</span>
        <span>
          Zdravlje integracija, odobrenja na čekanju i revizioni trag prikazuju se
          kada budu implementirani u fazama 2 i 3.
        </span>
      </section>
    </div>
  )
}
