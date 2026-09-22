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
-- (pendiente de construir la interfaz de autocompletado, Fase 1.1)
-- ----------------------------------------------------------------------------
create table deca.directorio (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('contratante', 'transportista', 'lugar_carga', 'lugar_entrega')),
  nombre text not null,
  nif text,
  calle text,
  codigo_postal text,
  poblacion text,
  provincia text,
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
-- rellenados una sola vez en el formulario.
--
-- El "contratante" es quien contrata al transportista efectivo dentro de la
-- cadena de subcontratación. Uno de los dos (contratante / transportista) es
-- el "propietario" del documento: quien lo genera y a quien no se le envía
-- copia — la copia del DeCA (art. 8) va siempre a la otra parte, usando el
-- email/teléfono que ya se recoge en su propia tarjeta.
-- ----------------------------------------------------------------------------
create table deca.expediciones (
  id uuid primary key default gen_random_uuid(),

  contratante_nombre text not null,
  contratante_nif text not null,
  contratante_calle text,
  contratante_codigo_postal text,
  contratante_poblacion text,
  contratante_provincia text,
  contratante_telefono text,
  contratante_email text,

  transportista_nombre text not null,
  transportista_nif text not null,
  transportista_calle text,
  transportista_codigo_postal text,
  transportista_poblacion text,
  transportista_provincia text,
  transportista_telefono text,
  transportista_email text,

  propietario_documento text not null check (propietario_documento in ('contratante', 'transportista')),

  -- lugar_origen / lugar_destino son solo el punto de partida/llegada del
  -- transporte (puede no coincidir con el domicilio fiscal de ninguna de las
  -- partes) — por eso llevan solo código postal y población, sin calle.
  lugar_origen_codigo_postal text not null,
  lugar_origen_poblacion text not null,
  lugar_destino_codigo_postal text not null,
  lugar_destino_poblacion text not null,
  fecha_transporte date not null,

  naturaleza_mercancia text not null,
  peso_kg numeric,
  peso_indeterminado boolean not null default false,
  magnitud_alternativa text,

  matricula_vehiculo text not null,
  autorizacion_especial text,
  observaciones text,

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
-- expedición (documento independiente, firma manuscrita, no eIDAS).
--
-- lugar_carga y lugar_entrega son el punto físico real de carga/descarga
-- (puede ser un almacén distinto del domicilio fiscal del contratante o del
-- destinatario legal — p. ej. una empresa con varios almacenes), por eso son
-- bloques propios con su propio nombre y dirección, sin NIF (la carta de
-- porte no lo exige para estos dos puntos).
-- ----------------------------------------------------------------------------
create table deca.cartas_porte (
  id uuid primary key default gen_random_uuid(),
  expedicion_id uuid not null unique references deca.expediciones(id) on delete cascade,

  lugar_carga_nombre text,
  lugar_carga_calle text,
  lugar_carga_codigo_postal text,
  lugar_carga_poblacion text,
  lugar_carga_provincia text,
  lugar_carga_fecha date,
  lugar_carga_hora time,

  lugar_entrega_nombre text not null,
  lugar_entrega_calle text,
  lugar_entrega_codigo_postal text not null,
  lugar_entrega_poblacion text not null,
  lugar_entrega_provincia text,
  lugar_entrega_fecha date,
  lugar_entrega_hora time,

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
