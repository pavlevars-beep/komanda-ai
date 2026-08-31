# 04 — Struktura projekta

## Odluka: jedna Next.js aplikacija sa strogim unutrašnjim granicama

Ne monorepo. Za MVP, `pnpm workspace` donosi režijski trošak bez koristi, jer imamo jedan deployment cilj.

Modularnost se postiže drugačije: `src/core/` je **čist TypeScript** — bez React-a, bez Next-a, bez direktne Supabase zavisnosti. Zbog toga se svaki modul može izdvojiti u zaseban paket kasnije bez prepravke, a testira se bez podizanja aplikacije.

Granice se sprovode alatom, ne dogovorom (`eslint-plugin-boundaries`):

| Pravilo | Razlog |
|---|---|
| `src/core/**` ne sme importovati `react`, `next`, `src/app`, `src/ui` | domen ostaje prenosiv i testabilan |
| `src/app/**` ne sme importovati `src/server/db/admin-client` | `service_role` nikad blizu UI koda |
| `src/ui/**` ne sme importovati `src/core/**/repository` | komponente ne pristupaju bazi |
| `src/core/connectors/impl/**` ne sme importovati `src/core/ai/**` | konektor ne zna za AI |
| nijedan `'use client'` fajl ne sme importovati `src/server/**` | sprečava curenje serverskog koda u bundle |

Postoji i CI provera koja skenira klijentski bundle na obrasce tajni i na uvoz serverskih modula.

## Stablo

```
komanda-ai/
├── src/
│   ├── app/                          # Next.js App Router — SAMO ruting i UI kompozicija
│   │   ├── (auth)/
│   │   │   ├── login/  invite/[token]/  reset-password/
│   │   ├── (console)/                # Delta Pro konzola
│   │   │   ├── layout.tsx            # guard: platform_staff, traka impersonation sesije
│   │   │   └── console/
│   │   │       ├── page.tsx                    # Pregled
│   │   │       ├── clients/
│   │   │       │   ├── page.tsx  new/page.tsx
│   │   │       │   └── [orgId]/                # radni prostor klijenta
│   │   │       │       ├── overview/ profile/ branding/ users/ roles/
│   │   │       │       ├── integrations/[integrationId]/  integrations/new/
│   │   │       │       ├── data-sources/ ai-tools/ automations/
│   │   │       │       ├── reports/ alerts/ dashboard/ security/ usage/ audit/
│   │   │       ├── integrations/     # katalog konektora
│   │   │       ├── ai-tools/ automations/ approvals/ health/ logs/ audit/
│   │   │       ├── staff/ settings/
│   │   ├── (workspace)/              # klijent
│   │   │   ├── layout.tsx            # guard: članstvo, brend tema, traka nadzora
│   │   │   └── w/[orgSlug]/
│   │   │       ├── page.tsx                    # Početna
│   │   │       ├── ask/ reports/[id]/ alerts/
│   │   │       ├── approvals/[id]/ operations/ documents/ settings/
│   │   ├── api/
│   │   │   ├── console/**            # guard: platform_staff + administrable org
│   │   │   ├── workspace/**          # guard: članstvo + permisija
│   │   │   ├── agent/**              # lokalni konektor (claim/report), mTLS + HMAC
│   │   │   ├── webhooks/[integrationId]/   # HMAC potpis, bez kolačića
│   │   │   └── health/
│   │   ├── layout.tsx  error.tsx  not-found.tsx  globals.css
│   │
│   ├── core/                         # DOMEN — čist TypeScript, bez React/Next
│   │   ├── auth/          session.ts  rbac.ts  permissions.ts  guards.ts
│   │   ├── tenancy/       org-context.ts  impersonation.ts  membership.ts
│   │   ├── secrets/       provider.ts  vault-provider.ts  secret.ts (branded tip)
│   │   ├── connectors/
│   │   │   ├── types.ts            # Connector, CapabilityDescriptor, ConnectorContext
│   │   │   ├── registry.ts
│   │   │   ├── runner.ts           # timeout, retry, SSRF guard, audit, health zapis
│   │   │   └── impl/
│   │   │       ├── demo/           # deterministički, uvek označen kao demo
│   │   │       ├── rest/
│   │   │       ├── webhook/
│   │   │       └── _planned/       # mssql, postgres, mis-erp, m365, n8n, local-agent
│   │   ├── ai/
│   │   │   ├── provider.ts  openai-provider.ts
│   │   │   ├── tools/              # registry.ts + jedan fajl po alatu
│   │   │   ├── orchestrator.ts     # filtriranje alata, ponovna provera, izvršenje
│   │   │   ├── provenance.ts       # izvor + freshness + klasifikacija
│   │   │   └── guards.ts           # odbacivanje organization_id iz modela
│   │   ├── approvals/     service.ts  actions/  executor.ts  (idempotencija)
│   │   ├── alerts/  reports/  automation/  notifications/  branding/
│   │   ├── audit/         writer.ts  actions.ts (tipizovana lista događaja)
│   │   └── shared/        result.ts  errors.ts  money.ts  freshness.ts
│   │
│   ├── server/                       # infrastruktura
│   │   ├── db/  user-client.ts  admin-client.ts  types.generated.ts
│   │   ├── http/ with-auth.ts  rate-limit.ts  csrf.ts  errors.ts  request-id.ts
│   │   ├── logger.ts                 # redakcija tajni
│   │   └── env.ts                    # Zod validacija, pada pri startu ako fali varijabla
│   │
│   ├── ui/                           # design system — bez poslovne logike
│   │   ├── primitives/   Button Input Select Dialog Sheet Tabs Tooltip Toast
│   │   ├── patterns/     PageHeader MetricCard StatusBadge DataTable EmptyState
│   │   │                 ErrorState IntegrationCard ApprovalCard AlertItem
│   │   │                 ActivityItem AuditEntry SourceBadge FreshnessIndicator
│   │   │                 ClassificationBadge OnboardingChecklist ImpersonationBanner
│   │   ├── charts/       (restrained — line, bar, sparkline)
│   │   └── theme/        tokens.css  brand.ts (izvođenje pristupačne palete)
│   │
│   ├── i18n/             config.ts  messages/sr.json  messages/en.json
│   └── config/           navigation.ts  permissions.ts  onboarding-steps.ts
│
├── supabase/
│   ├── migrations/       0001_lockdown.sql … 00NN_*.sql
│   ├── seed/             00_platform.sql  10_demo_distribucija.sql  20_demo_hotel.sql
│   └── tests/            rls_*.sql  policy_shape.sql  (pgTAP)
│
├── tests/
│   ├── unit/  integration/
│   └── security/         tenant-isolation  permissions  secrets-leak  ai-guards
│
├── docs/
│   ├── 01-arhitektura.md  02-baza-podataka.md  03-rls-i-bezbednost.md
│   ├── 04-struktura-projekta.md  05-ui-mapa.md  06-plan-isporuke.md
│   └── adr/              0001-… (arhitektonske odluke)
│
├── .env.example          # nikad .env u repozitorijumu
├── eslint.config.mjs     # uključuje boundaries pravila
└── tsconfig.json         # strict: true, noUncheckedIndexedAccess: true
```

## Konvencije

- **Nijedna React komponenta ne poziva bazu.** Podatke dobija kao props iz server komponente ili preko API rute.
- **Jedan modul = jedna odgovornost.** `service.ts` (logika) / `repository.ts` (upiti) / `schema.ts` (Zod) / `types.ts`.
- **Rezultati umesto izuzetaka** u domenu: `Result<T, DomainError>`. Izuzeci ostaju za stvarno neočekivano.
- **Bez `any`.** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- **Tipovi baze se generišu** (`supabase gen types`), ne pišu se ručno.
- **Svaki događaj revizije je u tipizovanoj listi** (`core/audit/actions.ts`) — nema slobodnog teksta kao naziva akcije.
