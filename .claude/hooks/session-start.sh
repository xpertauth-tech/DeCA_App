#!/bin/bash
# Comprueba, al arrancar la sesión, que hay conexión directa al Supabase
# autoalojado de Helsinki (no al Supabase Cloud — ver README). Sin esta
# variable no se pueden aplicar migraciones ni consultar la base real desde
# aquí, así que lo primero es avisar si falta, en vez de descubrirlo a mitad
# de una tarea.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if [ -z "${DECA_DB_URL:-}" ]; then
  cat <<'EOF'
⚠️  DECA_DB_URL no está configurada en este entorno.

Sin ella no hay conexión directa (psql) al Supabase autoalojado de Helsinki
que usa esta app en producción — no se podrán aplicar migraciones ni
consultar datos reales en esta sesión.

Para configurarla (una sola vez por entorno): menú del entorno en la barra
de título de la sesión → Edit → variables de entorno / API credentials →
añade DECA_DB_URL con la cadena postgresql://usuario:contraseña@host:puerto/basededatos
del servidor de Helsinki. Revisa también el acceso de red del entorno para
que el host de Helsinki esté permitido.
EOF
  exit 0
fi

if command -v psql >/dev/null 2>&1; then
  if psql "$DECA_DB_URL" -X -q -t -c "select 1;" >/dev/null 2>&1; then
    echo "✅ Conexión a Supabase (Helsinki) verificada vía DECA_DB_URL."
  else
    echo "⚠️  DECA_DB_URL está definida pero la conexión a Helsinki ha fallado. Revisa la cadena de conexión y el acceso de red del entorno."
  fi
fi
