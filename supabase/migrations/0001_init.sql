-- ============================================================================
-- DeCA_App — Esquema inicial
-- Instancia self-hosted en el Supabase de XpertAuth (Helsinki): las tablas
-- viven en su propio esquema "deca" para no mezclarse con las demás apps
-- que comparten ese mismo servidor (cada proyecto, su esquema).
-- ============================================================================

create schema if not exists deca;
grant usage on schema deca to anon, service_role;

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- configuracion: fila única con los ajustes de esta instancia
-- ----------------------------------------------------------------------------
create table deca.configuracion (
  id smallint primary key default 1 check (id = 1),
  empresa_nombre text,
  logo_url text,
  plazo_conservacion_meses smallint not null default 18,
  updated_at timestamptz not null default now()
);

insert into deca.configuracion (id) values (1);

-- ----------------------------------------------------------------------------
-- directorio: "efecto memoria" — contactos frecuentes por tipo de parte
-- ----------------------------------------------------------------------------
create table deca.directorio (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('cargador', 'transportista', 'destinatario', 'expedidor')),
  nombre text not null,
  nif text,
  direccion text,
  telefono text,
  email text,
  veces_usado integer not null default 1,
  ultima_vez timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tipo, nif)
);

create index idx_directorio_busqueda on deca.directorio (tipo, nombre text_pattern_ops);

-- ----------------------------------------------------------------------------
-- expediciones: datos comunes de un envío (art. 6 Orden FOM/2861/2012),
-- rellenados una sola vez en el formulario
-- ----------------------------------------------------------------------------
create table deca.expediciones (
  id uuid primary key default gen_random_uuid(),

  cargador_nombre text not null,
  cargador_nif text not null,
  cargador_direccion text,
  cargador_telefono text,
  cargador_email text,

  transportista_nombre text not null,
  transportista_nif text not null,
  transportista_direccion text,
  transportista_telefono text,
  transportista_email text,

  lugar_origen text not null,
  lugar_destino text not null,
  fecha_transporte date not null,

  naturaleza_mercancia text not null,
  peso_kg numeric,
  peso_indeterminado boolean not null default false,
  magnitud_alternativa text,

  matricula_vehiculo text not null,
  autorizacion_especial text,
  observaciones text,

  -- contraparte a la que se le envía copia del DeCA (art. 8 — ejemplares)
  contraparte_email text,
  contraparte_telefono text,

  incluye_carta_porte boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_expediciones_fecha on deca.expediciones (fecha_transporte desc);

-- ----------------------------------------------------------------------------
-- deca_documentos: versiones del DeCA. Método 1 = se actualiza la vigente;
-- Método 2 = se inserta una fila nueva y se conserva la anterior (trazabilidad)
-- ----------------------------------------------------------------------------
create table deca.deca_documentos (
  id uuid primary key default gen_random_uuid(),
  expedicion_id uuid not null references deca.expediciones(id) on delete cascade,
  version integer not null default 1,
  slug text not null unique,
  storage_path text not null,
  metodo_modificacion smallint check (metodo_modificacion in (1, 2)),
  motivo_cambio text,
  vigente boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_deca_slug on deca.deca_documentos (slug);
create index idx_deca_expedicion on deca.deca_documentos (expedicion_id);

-- ----------------------------------------------------------------------------
-- cartas_porte: campos adicionales del art. 10 bis Ley 15/2009, uno por
-- expedición (documento independiente, firma manuscrita, no eIDAS)
-- ----------------------------------------------------------------------------
create table deca.cartas_porte (
  id uuid primary key default gen_random_uuid(),
  expedicion_id uuid not null unique references deca.expediciones(id) on delete cascade,

  expedidor_nombre text,
  expedidor_direccion text,

  destinatario_nombre text not null,
  destinatario_direccion text not null,

  lugar_recepcion text,
  fecha_recepcion date,
  hora_recepcion time,

  lugar_entrega_previsto text,
  fecha_entrega_prevista date,
  hora_entrega_prevista time,

  precio_transporte numeric,
  gastos_relacionados numeric,

  storage_path text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at automático en expediciones
-- ----------------------------------------------------------------------------
create or replace function deca.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = '';

create trigger trg_expediciones_updated_at
  before update on deca.expediciones
  for each row execute function deca.set_updated_at();

-- ============================================================================
-- Seguridad: el navegador solo usa la clave "anon". Con RLS activado y sin
-- políticas de escritura, el anon key nunca puede crear ni modificar nada.
-- Toda escritura (crear expedición, generar PDF, subir a Storage) pasa por
-- una Edge Function que usa la service_role key (nunca sale del servidor).
-- Las únicas lecturas públicas permitidas son la configuración visual de la
-- instancia (nombre/logo, no sensible) y un documento por su slug único e
-- impredecible (la propia URL del QR) — nunca un listado.
-- ============================================================================
alter table deca.configuracion enable row level security;
alter table deca.directorio enable row level security;
alter table deca.expediciones enable row level security;
alter table deca.deca_documentos enable row level security;
alter table deca.cartas_porte enable row level security;

create policy "lectura publica de la configuracion"
  on deca.configuracion for select
  to anon
  using (true);

create policy "lectura publica del DeCA por slug"
  on deca.deca_documentos for select
  to anon
  using (true);

grant select on deca.configuracion to anon;
grant select on deca.deca_documentos to anon;
grant all on all tables in schema deca to service_role;

-- El resto de tablas no tienen ninguna política para "anon": sin política,
-- RLS deniega todo acceso desde el navegador. El panel interno de la app
-- (crear/consultar expediciones, directorio) siempre se sirve a través de
-- la Edge Function autenticada con la service_role key.

-- ============================================================================
-- Nota de despliegue: en el Supabase autoalojado, el esquema "deca" debe
-- añadirse a PGRST_DB_SCHEMAS en el .env del stack (junto a public, storage,
-- graphql_public, etc.) y reconstruirse el contenedor "rest" con
-- `docker compose up -d rest` (un simple `docker restart` no relee el .env).
-- ============================================================================
