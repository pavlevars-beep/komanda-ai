import { z } from 'zod'

/**
 * Identifikator onakav kakav ga PostgreSQL stvarno čuva.
 *
 * `uuid()` u Zod-u 4 traži RFC 4122 verzione bitove. PostgreSQL tip
 * `uuid` ih NE traži — prihvata svaku 128-bitnu vrednost u obliku 8-4-4-4-12.
 * Razlika nije akademska: seed koristi čitljive identifikatore poput
 * `00000000-0000-0000-0000-00000000d002`, koje Postgres uredno čuva a stroga
 * provera odbija.
 *
 * Posledica bi bila da svaki upit nad demo bazom pukne na validaciji, iako je
 * podatak potpuno ispravan. Zato se ovde proverava oblik koji baza garantuje,
 * ne oblik koji specifikacija preporučuje.
 */
export const uuid = () =>
  z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, {
    message: 'Nije ispravan identifikator.',
  })

export const isUuid = (value: string): boolean =>
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)
