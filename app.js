// DeCA_App — inicialización básica del cliente.
// El navegador solo usa la clave pública "anon": solo puede LEER un DeCA
// por su slug (política RLS en deca_documentos). Crear expediciones,
// generar documentos y enviar correos siempre pasa por una Edge Function
// con la service_role key, nunca desde aquí.

const supabaseClient =
  window.DECA_CONFIG &&
  window.supabase.createClient(
    window.DECA_CONFIG.SUPABASE_URL,
    window.DECA_CONFIG.SUPABASE_ANON_KEY
  );

async function cargarConfiguracionVisual() {
  if (!supabaseClient) {
    console.warn("Falta config.js — copia config.example.js y rellena tus datos de Supabase.");
    return;
  }

  const { data, error } = await supabaseClient
    .schema("deca")
    .from("configuracion")
    .select("empresa_nombre, logo_url")
    .eq("id", 1)
    .single();

  if (error) {
    console.warn("No se pudo cargar la configuración de la instancia:", error.message);
    return;
  }

  if (data.empresa_nombre) {
    document.getElementById("empresa-nombre").textContent = `DeCA — ${data.empresa_nombre}`;
  }
  if (data.logo_url) {
    document.getElementById("empresa-logo").src = data.logo_url;
    document.getElementById("empresa-logo").title = data.empresa_nombre || "Logo de la empresa";
  }
}

cargarConfiguracionVisual();

// --- Autorrelleno de provincia a partir del código postal ------------------
// Los dos primeros dígitos del código postal español determinan la
// provincia de forma unívoca (01-52). El campo se deja editable por si hay
// algún caso particular que corregir a mano.
const PROVINCIA_POR_PREFIJO_CP = {
  "01": "Álava/Araba", "02": "Albacete", "03": "Alicante", "04": "Almería",
  "05": "Ávila", "06": "Badajoz", "07": "Balears (Illes)", "08": "Barcelona",
  "09": "Burgos", "10": "Cáceres", "11": "Cádiz", "12": "Castellón",
  "13": "Ciudad Real", "14": "Córdoba", "15": "Coruña (A)", "16": "Cuenca",
  "17": "Girona", "18": "Granada", "19": "Guadalajara", "20": "Gipuzkoa",
  "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León",
  "25": "Lleida", "26": "Rioja (La)", "27": "Lugo", "28": "Madrid",
  "29": "Málaga", "30": "Murcia", "31": "Navarra", "32": "Ourense",
  "33": "Asturias", "34": "Palencia", "35": "Palmas (Las)", "36": "Pontevedra",
  "37": "Salamanca", "38": "Santa Cruz de Tenerife", "39": "Cantabria",
  "40": "Segovia", "41": "Sevilla", "42": "Soria", "43": "Tarragona",
  "44": "Teruel", "45": "Toledo", "46": "Valencia", "47": "Valladolid",
  "48": "Bizkaia", "49": "Zamora", "50": "Zaragoza", "51": "Ceuta", "52": "Melilla",
};

function autorrellenarProvincia(nombreCampoCp, nombreCampoProvincia) {
  const campoCp = document.querySelector(`[name="${nombreCampoCp}"]`);
  const campoProvincia = document.querySelector(`[name="${nombreCampoProvincia}"]`);
  if (!campoCp || !campoProvincia) return;

  campoCp.addEventListener("input", () => {
    const provincia = PROVINCIA_POR_PREFIJO_CP[campoCp.value.slice(0, 2)];
    if (provincia) {
      campoProvincia.value = provincia;
    }
  });
}

[
  ["contratante_codigo_postal", "contratante_provincia"],
  ["transportista_codigo_postal", "transportista_provincia"],
  ["lugar_carga_codigo_postal", "lugar_carga_provincia"],
  ["lugar_entrega_codigo_postal", "lugar_entrega_provincia"],
].forEach(([cp, provincia]) => autorrellenarProvincia(cp, provincia));

// --- Formulario de creación de expedición (Fase 1) -------------------------
// La escritura real (insertar en expediciones / cartas_porte) pasa siempre
// por una Edge Function con la service_role key, nunca desde el navegador
// (ver política RLS en supabase/migrations/0001_init.sql).

const formExpedicion = document.getElementById("form-expedicion");
const checkboxCartaPorte = document.getElementById("incluye_carta_porte");
const camposCartaPorte = document.getElementById("carta-porte-campos");
const resultadoSection = document.getElementById("resultado");
const resultadoNota = document.getElementById("resultado-nota");
const resultadoJson = document.getElementById("resultado-json");

checkboxCartaPorte.addEventListener("change", () => {
  const incluye = checkboxCartaPorte.checked;
  camposCartaPorte.hidden = !incluye;
  camposCartaPorte
    .querySelectorAll("[name='lugar_entrega_nombre'], [name='lugar_entrega_codigo_postal'], [name='lugar_entrega_poblacion']")
    .forEach((campo) => campo.required = incluye);
});

async function crearExpedicion(payload) {
  const endpoint = window.DECA_CONFIG && window.DECA_CONFIG.CREAR_EXPEDICION_URL;
  if (!endpoint) {
    return { guardado: false, motivo: "Backend no configurado todavía (falta desplegar la Edge Function crear-expedicion)." };
  }

  const respuesta = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${window.DECA_CONFIG.SUPABASE_ANON_KEY}`,
      "apikey": window.DECA_CONFIG.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!respuesta.ok) {
    const error = await respuesta.text();
    throw new Error(`La Edge Function respondió ${respuesta.status}: ${error}`);
  }

  return { guardado: true, ...(await respuesta.json()) };
}

formExpedicion.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (!formExpedicion.reportValidity()) {
    return;
  }

  const datos = new FormData(formExpedicion);
  const payload = Object.fromEntries(datos.entries());
  payload.peso_indeterminado = datos.has("peso_indeterminado");
  payload.incluye_carta_porte = datos.has("incluye_carta_porte");

  let resultado;
  try {
    resultado = await crearExpedicion(payload);
  } catch (error) {
    resultado = { guardado: false, motivo: error.message };
  }

  resultadoNota.textContent = resultado.guardado
    ? "Expedición guardada correctamente."
    : `No se ha guardado todavía: ${resultado.motivo}`;
  resultadoJson.textContent = JSON.stringify(payload, null, 2);
  resultadoSection.hidden = false;
  resultadoSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

// TODO Fase 1.1: autocompletado desde el directorio de contactos frecuentes
// (requiere una Edge Function de lectura, ya que "directorio" no tiene
// política RLS para "anon"), buscando por NIF (contratante/transportista) o
// por nombre (lugar_carga/lugar_entrega, que no llevan NIF).
// TODO Fase 2: generación de PDF nativo + slug único + QR (Edge Function).
// TODO Fase 3: envío por WhatsApp/Telegram (enlaces wa.me / t.me) y por
// email a la contraparte — el email/teléfono de quien NO sea el
// "propietario_documento" (Edge Function + Resend).
