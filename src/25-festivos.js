/* ============ 25 · festivos de Colombia y temporadas ============
   No es una tabla escrita a mano: se calculan con la Ley 51 de 1983 (los festivos "Emiliani" pasan al lunes siguiente)
   y la fecha de Pascua, así sirven para cualquier año. Sábado Santo y Domingo de Resurrección NO son festivos legales:
   se marcan como "temporada" porque en una paletería venden como festivo. Un "puente" es el sábado o domingo pegado a
   un festivo (por ejemplo, el fin de semana antes de un lunes festivo). */
function pascua(y) {                                   // algoritmo de Meeus/Jones/Butcher (calendario gregoriano)
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(new Date(y, mes - 1, dia));
}
const lunesSig = s => addDays(s, (8 - dowOf(s)) % 7);   // el mismo día si ya es lunes
const FEST_FIJOS = [["01-01", "Año Nuevo"], ["05-01", "Día del Trabajo"], ["07-20", "Día de la Independencia"], ["08-07", "Batalla de Boyacá"], ["12-08", "Inmaculada Concepción"], ["12-25", "Navidad"]];
const FEST_LUNES = [["01-06", "Reyes Magos"], ["03-19", "San José"], ["06-29", "San Pedro y San Pablo"], ["08-15", "Asunción de la Virgen"], ["10-12", "Día de la Raza"], ["11-01", "Todos los Santos"], ["11-11", "Independencia de Cartagena"]];
function festivosAnio(y) {
  return memo("fest:" + y, () => {
    const m = {}, add = (f, n, tipo) => { if (m[f]) { m[f].n += " y " + n; if (tipo === "festivo") m[f].tipo = "festivo"; } else m[f] = {f, n, tipo}; }, e = pascua(y);
    for (const [md, n] of FEST_FIJOS) add(y + "-" + md, n, "festivo");
    for (const [md, n] of FEST_LUNES) add(lunesSig(y + "-" + md), n, "festivo");
    add(addDays(e, -3), "Jueves Santo", "festivo"); add(addDays(e, -2), "Viernes Santo", "festivo");
    add(addDays(e, -1), "Sábado Santo", "temporada"); add(e, "Domingo de Resurrección", "temporada");
    add(addDays(e, 43), "Ascensión del Señor", "festivo"); add(addDays(e, 64), "Corpus Christi", "festivo"); add(addDays(e, 71), "Sagrado Corazón", "festivo");
    return m;
  });
}
const festivoDe = f => festivosAnio(Number(f.slice(0, 4)))[f] || null;
const esFestivo = f => { const x = festivoDe(f); return !!(x && x.tipo === "festivo"); };
/* ¿el día es especial para la demanda? festivo, temporada (Semana Santa) o puente (fin de semana pegado a un festivo) */
function diaEspecial(f) {
  const x = festivoDe(f); if (x) return {tipo: x.tipo, n: x.n};
  const w = dowOf(f);
  if (w === 6 && (esFestivo(addDays(f, -1)) || esFestivo(addDays(f, 2)))) return {tipo: "puente", n: "Puente de " + (festivoDe(addDays(f, 2)) || festivoDe(addDays(f, -1))).n};
  if (w === 0 && (esFestivo(addDays(f, 1)) || esFestivo(addDays(f, -2)))) return {tipo: "puente", n: "Puente de " + (festivoDe(addDays(f, 1)) || festivoDe(addDays(f, -2))).n};
  return null;
}
/* festivos y temporadas entre dos fechas (para la lista de Ajustes) */
function festivosEntre(a, b) { const out = []; for (let y = Number(a.slice(0, 4)); y <= Number(b.slice(0, 4)); y++) for (const x of Object.values(festivosAnio(y))) if (x.f >= a && x.f <= b) out.push(x); return out.sort((p, q) => p.f < q.f ? -1 : 1); }
/* el próximo fin de semana largo (sábado + domingo + festivos pegados) que empieza en los próximos `dias` días */
function proximoPuente(dias = 7) {
  for (let i = 0; i <= dias; i++) { const f = addDays(S.today, i); if (dowOf(f) !== 6) continue; const fs = bloqueFinde(f); if (fs.length > 2) return {fechas: fs, nombres: [...new Set(fs.map(festivoDe).filter(Boolean).map(x => x.n))]}; }
  return null;
}
/* sábado y domingo más los festivos y días de temporada pegados antes o después (Semana Santa: jueves a domingo) */
function bloqueFinde(sab) {
  const out = [sab, addDays(sab, 1)]; let a = addDays(sab, -1), b = addDays(sab, 2);
  while (a >= S.today && festivoDe(a) && out.length < 6) { out.unshift(a); a = addDays(a, -1); }
  while (festivoDe(b) && out.length < 6) { out.push(b); b = addDays(b, 1); }
  return out;
}
/* colchón: cuánto más pedir para festivos, temporadas y puentes. Lo decide el administrador (por defecto 20 %). */
const COLCHON_FESTIVO = 0.2;
const colchonFestivo = () => { const c = configNeg().colchonFestivo; return c != null ? clamp(c, 0, 1) : COLCHON_FESTIVO; };
const rangoFechasTxt = fs => fs.length ? (fs.length === 1 ? diaCorto(fs[0]) : diaCorto(fs[0]) + " a " + diaCorto(fs[fs.length - 1])) : "";
