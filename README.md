# DeCA_App

Aplicación para generar y archivar el **DeCA** (Documento Electrónico de
Control Administrativo) y, opcionalmente, la **carta de porte**, con URL
única y código QR, conforme a:

- Orden FOM/2861/2012 (art. 6, contenido; art. 8, ejemplares; art. 9,
  conservación)
- Resolución de 5 de junio de 2026 (requisitos técnicos del DeCA electrónico)
- Ley 9/2025, disposición transitoria octava (digitalización obligatoria)
- Ley 15/2009, art. 10 bis (contenido de la carta de porte con porteador
  efectivo)

Creada y cedida gratuitamente por [XpertAuth](https://xpertauth.com), sin
ánimo de lucro, como apoyo al sector del transporte. Cada empresa que la
instala aloja su propia copia (su propio Supabase, su propio dominio) y es
responsable de su uso — XpertAuth no opera, aloja ni tiene acceso a los
datos de ninguna instancia instalada por terceros.

## Stack

HTML/CSS/JS sin build step ni framework, igual que
[DeCA_Manual](https://github.com/xpertauth-tech/DeCA_Manual) — misma
filosofía de simplicidad, para que sea fácil de leer, modificar y desplegar
sin herramientas adicionales. Si en algún momento hace falta más estructura,
se puede introducir un framework más adelante sin perder lo ya construido.

- **Datos y almacenamiento:** Supabase (Postgres + Storage).
- **Despliegue:** Vercel (plan gratuito Hobby).
- **Envío de email:** Resend, desde una Supabase Edge Function (la clave de
  API nunca llega al navegador).
- **QR:** generado en el propio navegador a partir de la URL única del
  documento.

## Estructura

```
supabase/migrations/   Esquema de la base de datos
supabase/functions/    Edge Functions (crear expedición, generar PDF/QR, enviar email)
public/                Frontend estático (formulario, página pública del DeCA)
assets/                Logos e imágenes de marca
```

## Modelo de datos (resumen)

Todas las tablas viven en su propio esquema, **`deca`** (no en `public`), para
no mezclarse con otras aplicaciones que puedan compartir el mismo servidor
Supabase — igual que ya se hace con otros proyectos de XpertAuth.

- `deca.configuracion` — ajustes de esta instancia (nombre de empresa, logo,
  plazo de conservación).
- `deca.directorio` — contactos frecuentes (cargador / transportista /
  destinatario / expedidor) para el autocompletado ("efecto memoria").
- `deca.expediciones` — datos comunes del envío, art. 6, rellenados una sola vez.
- `deca.deca_documentos` — versiones del DeCA (una fila por versión; Método 1
  actualiza la vigente, Método 2 añade una nueva conservando la anterior).
- `deca.cartas_porte` — datos adicionales del art. 10 bis de la Ley 15/2009,
  un documento independiente y separado del DeCA.

Detalle completo en
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).

### Si tu Supabase es autoalojado

PostgREST solo expone los esquemas listados en `PGRST_DB_SCHEMAS` (variable
de entorno del stack de Supabase). Añade `deca` a esa lista y recuerda que
**`docker restart` no relee el `.env`** — hace falta recrear el contenedor:

```bash
docker compose up -d rest
```

Y como Kong no exige JWT en las funciones sueltas (solo lo hace la función
`main`), `crear-expedicion` comprueba ella misma el `anon key` recibido en la
cabecera `Authorization`.

## Seguridad

El navegador solo usa la clave pública (`anon`) de Supabase, y únicamente
para leer un DeCA por su slug único (la propia URL del QR). Row Level
Security está activado en todas las tablas y no hay ninguna política de
escritura para `anon`: crear una expedición, generar el PDF, subir a Storage
o enviar el email a la contraparte pasa siempre por una Edge Function que
usa la `service_role` key — esa clave nunca sale del servidor.

## Estado

En construcción. El formulario de alta de expedición (Fase 1) ya tiene sus
campos y validación en el navegador; todavía no persiste datos porque falta
desplegar la Edge Function `crear-expedicion` contra un proyecto real de
Supabase — hasta entonces, al enviarlo se muestra el payload que se
guardaría. Próximo paso: esa Edge Function (Fase 2) y el autocompletado
desde el directorio de contactos frecuentes.

## Instalación (borrador, se completa en la Fase 7)

1. Usa esta plantilla ("Use this template" en GitHub) para crear tu propia
   copia del repositorio.
2. Crea un proyecto gratuito en [Supabase](https://supabase.com) y ejecuta
   el script de `supabase/migrations/0001_init.sql`.
3. Crea una cuenta gratuita en [Resend](https://resend.com) para el envío
   de correos.
4. Despliega en [Vercel](https://vercel.com) conectando tu copia del
   repositorio, con las variables de entorno de Supabase y Resend.
5. Sube tu logo desde la pantalla de configuración inicial de la app.
