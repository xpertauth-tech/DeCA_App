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
  "cargador_nombre",
  "cargador_nif",
  "transportista_nombre",
  "transportista_nif",
  "lugar_origen",
  "lugar_destino",
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "deca" } }
  );

  const incluyeCartaPorte = Boolean(payload.incluye_carta_porte);

  if (incluyeCartaPorte && (!payload.destinatario_nombre || !payload.destinatario_direccion)) {
    return jsonResponse(
      { error: "La carta de porte requiere destinatario_nombre y destinatario_direccion" },
      400
    );
  }

  const { data: expedicion, error: errorExpedicion } = await supabase
    .from("expediciones")
    .insert({
      cargador_nombre: payload.cargador_nombre,
      cargador_nif: payload.cargador_nif,
      cargador_direccion: payload.cargador_direccion || null,
      cargador_telefono: payload.cargador_telefono || null,
      cargador_email: payload.cargador_email || null,
      transportista_nombre: payload.transportista_nombre,
      transportista_nif: payload.transportista_nif,
      transportista_direccion: payload.transportista_direccion || null,
      transportista_telefono: payload.transportista_telefono || null,
      transportista_email: payload.transportista_email || null,
      lugar_origen: payload.lugar_origen,
      lugar_destino: payload.lugar_destino,
      fecha_transporte: payload.fecha_transporte,
      naturaleza_mercancia: payload.naturaleza_mercancia,
      peso_kg: payload.peso_kg ? Number(payload.peso_kg) : null,
      peso_indeterminado: Boolean(payload.peso_indeterminado),
      magnitud_alternativa: payload.magnitud_alternativa || null,
      matricula_vehiculo: payload.matricula_vehiculo,
      autorizacion_especial: payload.autorizacion_especial || null,
      observaciones: payload.observaciones || null,
      contraparte_email: payload.contraparte_email || null,
      contraparte_telefono: payload.contraparte_telefono || null,
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
      expedidor_nombre: payload.expedidor_nombre || null,
      expedidor_direccion: payload.expedidor_direccion || null,
      destinatario_nombre: payload.destinatario_nombre,
      destinatario_direccion: payload.destinatario_direccion,
      lugar_recepcion: payload.lugar_recepcion || null,
      fecha_recepcion: payload.fecha_recepcion || null,
      hora_recepcion: payload.hora_recepcion || null,
      lugar_entrega_previsto: payload.lugar_entrega_previsto || null,
      fecha_entrega_prevista: payload.fecha_entrega_prevista || null,
      hora_entrega_prevista: payload.hora_entrega_prevista || null,
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
