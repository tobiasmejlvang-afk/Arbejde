# Supabase til Arbejde

## Klargør projektet

1. Åbn [projektets SQL Editor](https://supabase.com/dashboard/project/puywakntfvdnysvjynjt/sql/new). Kopiér hele `setup.sql` ind i en ny forespørgsel, og vælg **Run**. Scriptet opretter tabellen `arbejde_workspaces` og den private fotobucket `arbejde-photos`. Det kan køres igen med eksisterende data.
2. Under **Authentication → URL Configuration** skal du sætte **Site URL** til `https://tobiasmejlvang-afk.github.io/Arbejde/`. Tilføj den samme adresse under **Redirect URLs**. Hvis du bruger appen fra en anden udgivet adresse, skal du tilføje den konkrete adresse. [Supabase om omdirigering efter login](https://supabase.com/docs/guides/auth/redirect-urls)
3. Under **Authentication → Providers → Email** skal du aktivere e-mail og beholde **Confirm email** slået til. Tillad oprettelse af nye brugere, mens du opretter din konto, og behold anonyme logins slået fra. I en personlig app kan du derefter slå nyregistrering fra og stadig logge ind på begge enheder med din konto. Supabases standardmail leverer kun til adresser, som er medlemmer af projektets team. Hvis din adresse ikke er omfattet, kræver mailbekræftelse en SMTP-udbyder. [Indstillinger for login](https://supabase.com/docs/guides/auth/general-configuration) · [Maillevering](https://supabase.com/docs/guides/auth/auth-smtp)

Browserappen bruger projektets URL og **publishable key**. Hold databaseadgangskoden og eventuelle `service_role`- eller `sb_secret_`-nøgler private. [Supabase om API-nøgler](https://supabase.com/docs/guides/api/api-keys)

## Kontrollér opsætningen

Kør nedenstående i SQL Editor. De første fire kolonner skal vise `true`, og den sidste skal vise `false`.

```sql
select
  (select relrowsecurity from pg_class where oid = 'public.arbejde_workspaces'::regclass) as rls,
  has_table_privilege('authenticated', 'public.arbejde_workspaces', 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', 'public.arbejde_workspaces', 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', 'public.arbejde_workspaces', 'UPDATE') as authenticated_update,
  has_table_privilege('anon', 'public.arbejde_workspaces', 'SELECT') as anon_select;
```

Kør derefter denne forespørgsel for at kontrollere fotobucketen.

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'arbejde-photos';
```

Den anden forespørgsel skal vise én række med `public = false`, `file_size_limit = 5242880` og typerne `image/jpeg`, `image/png` og `image/webp`. Hvert arbejdsdokument er begrænset til 5 MiB. Den enkelte bruger har adgang til sin egen række og sine fotos under sin bruger-ID-mappe. [Rækkesikkerhed](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Adgang til private filer](https://supabase.com/docs/guides/storage/security/access-control)

Når appversionen med synkronisering er åbnet, kan du logge ind på din computer, gemme en testregistrering og synkronisere. Åbn den samme konto på tabletten, hent arbejdsdata og kontrollér, at registreringen vises dér.
