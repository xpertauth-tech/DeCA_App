import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Única puerta de escritura para expediciones y cartas de porte, sobre el
// esquema "deca" del Supabase autoalojado de XpertAuth. Kong no exige JWT en
// las funciones sueltas de este servidor (solo lo hace la función "main"),
// así que comprobamos aquí mismo que llega el anon key correcto antes de
// tocar la base de datos. La escritura real usa la service_role key, que
// nunca sale de este entorno de servidor.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CAMPOS_OBLIGATORIOS = [
  "contratante_nombre",
  "contratante_nif",
  "transportista_nombre",
  "transportista_nif",
  "propietario_documento",
  "lugar_origen_codigo_postal",
  "lugar_origen_poblacion",
  "lugar_destino_codigo_postal",
  "lugar_destino_poblacion",
  "fecha_transporte",
  "naturaleza_mercancia",
  "matricula_vehiculo",
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 405);
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const anonKeyEsperado = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  if (token !== anonKeyEsperado) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const faltantes = CAMPOS_OBLIGATORIOS.filter((campo) => !payload[campo]);
  if (faltantes.length > 0) {
    return jsonResponse({ error: `Faltan campos obligatorios: ${faltantes.join(", ")}` }, 400);
  }

  if (!["contratante", "transportista"].includes(String(payload.propietario_documento))) {
    return jsonResponse({ error: "propietario_documento debe ser 'contratante' o 'transportista'" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "deca" } }
  );

  const incluyeCartaPorte = Boolean(payload.incluye_carta_porte);

  if (
    incluyeCartaPorte &&
    (!payload.lugar_entrega_nombre || !payload.lugar_entrega_codigo_postal || !payload.lugar_entrega_poblacion)
  ) {
    return jsonResponse(
      { error: "La carta de porte requiere lugar_entrega_nombre, lugar_entrega_codigo_postal y lugar_entrega_poblacion" },
      400
    );
  }

  const { data: expedicion, error: errorExpedicion } = await supabase
    .from("expediciones")
    .insert({
      contratante_nombre: payload.contratante_nombre,
      contratante_nif: payload.contratante_nif,
      contratante_calle: payload.contratante_calle || null,
      contratante_codigo_postal: payload.contratante_codigo_postal || null,
      contratante_poblacion: payload.contratante_poblacion || null,
      contratante_provincia: payload.contratante_provincia || null,
      contratante_telefono: payload.contratante_telefono || null,
      contratante_email: payload.contratante_email || null,
      transportista_nombre: payload.transportista_nombre,
      transportista_nif: payload.transportista_nif,
      transportista_calle: payload.transportista_calle || null,
      transportista_codigo_postal: payload.transportista_codigo_postal || null,
      transportista_poblacion: payload.transportista_poblacion || null,
      transportista_provincia: payload.transportista_provincia || null,
      transportista_telefono: payload.transportista_telefono || null,
      transportista_email: payload.transportista_email || null,
      propietario_documento: payload.propietario_documento,
      lugar_origen_codigo_postal: payload.lugar_origen_codigo_postal,
      lugar_origen_poblacion: payload.lugar_origen_poblacion,
      lugar_destino_codigo_postal: payload.lugar_destino_codigo_postal,
      lugar_destino_poblacion: payload.lugar_destino_poblacion,
      fecha_transporte: payload.fecha_transporte,
      naturaleza_mercancia: payload.naturaleza_mercancia,
      peso_kg: payload.peso_kg ? Number(payload.peso_kg) : null,
      peso_indeterminado: Boolean(payload.peso_indeterminado),
      numero_bultos: payload.numero_bultos ? Number(payload.numero_bultos) : null,
      tipo_bultos: payload.tipo_bultos || null,
      magnitud_alternativa: payload.magnitud_alternativa || null,
      matricula_vehiculo: payload.matricula_vehiculo,
      autorizacion_especial: payload.autorizacion_especial || null,
      observaciones: payload.observaciones || null,
      incluye_carta_porte: incluyeCartaPorte,
    })
    .select()
    .single();

  if (errorExpedicion) {
    return jsonResponse({ error: errorExpedicion.message }, 500);
  }

  if (incluyeCartaPorte) {
    const { error: errorCarta } = await supabase.from("cartas_porte").insert({
      expedicion_id: expedicion.id,
      lugar_carga_nombre: payload.lugar_carga_nombre || null,
      lugar_carga_calle: payload.lugar_carga_calle || null,
      lugar_carga_codigo_postal: payload.lugar_carga_codigo_postal || null,
      lugar_carga_poblacion: payload.lugar_carga_poblacion || null,
      lugar_carga_provincia: payload.lugar_carga_provincia || null,
      lugar_carga_fecha: payload.lugar_carga_fecha || null,
      lugar_carga_hora: payload.lugar_carga_hora || null,
      lugar_entrega_nombre: payload.lugar_entrega_nombre,
      lugar_entrega_calle: payload.lugar_entrega_calle || null,
      lugar_entrega_codigo_postal: payload.lugar_entrega_codigo_postal,
      lugar_entrega_poblacion: payload.lugar_entrega_poblacion,
      lugar_entrega_provincia: payload.lugar_entrega_provincia || null,
      lugar_entrega_fecha: payload.lugar_entrega_fecha || null,
      lugar_entrega_hora: payload.lugar_entrega_hora || null,
      precio_transporte: payload.precio_transporte ? Number(payload.precio_transporte) : null,
      gastos_relacionados: payload.gastos_relacionados ? Number(payload.gastos_relacionados) : null,
    });

    if (errorCarta) {
      return jsonResponse(
        { error: `Expedición guardada pero falló la carta de porte: ${errorCarta.message}`, expedicion_id: expedicion.id },
        500
      );
    }
  }

  return jsonResponse({ expedicion_id: expedicion.id });
});
