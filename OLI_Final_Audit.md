# OLI · Auditoría final

**OLI · Software propiedad de VP Visual Project · Creado por Víctor Palacio**
Fecha: 5 de octubre de 2026 · Rama: `claude/admiring-cori-ejc2yg`

Este documento separa lo **probado de verdad** de lo **no probado**. Si algo no está marcado como probado, no se debe asumir que funciona.

---

## 1. Dónde está OLI

| Qué | Dónde |
|---|---|
| App en producción | https://oli-pos.vercel.app (Vercel, proyecto `oli-pos`) |
| Base de datos y usuarios | Supabase, proyecto `OLI` (`vfyaoasbwyhmnyrreuik`, región São Paulo, plan gratuito) |
| Código | GitHub `vpalacio1998-creator/vpalacio31`, rama `claude/admiring-cori-ejc2yg` |
| Versión de prueba en Claude | https://claude.ai/artifact/W852rvnhT965q34HqyoAWV (otra base de datos, independiente de Supabase) |

**Cuentas creadas** (las contraseñas se entregaron por chat; no están en el repositorio):
- Administrador (propietario): `admin@oli.app`
- Empleado: `empleado@oli.app`

Recomendación: cambiar ambas contraseñas desde Supabase → Authentication en cuanto se empiece a usar.

---

## 2. Qué hay cargado en producción (Supabase)

Cargado desde `OLI_negocio.xlsx` mediante la misma función que usa la app (`oli_apply`):
- **38 productos**: 12 paletas (10 normales a $11.000 y 2 light a $12.000), galleta, café, capuchino, latte, milo, michelada, agua, soda, 8 granizados y 10 insumos.
- **24 costos** (solo los que traía el Excel).
- **Inventario inicial de 12 productos** (las paletas del Excel, **94 unidades** en total). Agua, soda y galleta **no** tienen inventario cargado porque el Excel no lo traía.
- **Gastos fijos del mes**: arriendo $1.500.000, trabajadoras $3.000.000 e industria y comercio $70.000. **Luz, agua e internet quedaron en $0 con la etiqueta "falta el valor"**, porque el Excel no los tenía.
- **No se cargó**: la lista "Pendientes" del Excel y los granizados de café (sin precio ni costo).
- Los datos de las pruebas en producción **se borraron** al terminar. Queda solo el catálogo real.

---

## 3. Pruebas hechas y resultado

### 3.1 Prueba real en producción (Supabase + Vercel, navegador automático)
Se hizo desde un sandbox de Vercel con Chromium, contra https://oli-pos.vercel.app. Simula una tablet de 1180×820 para la empleada y un celular de 390×844 para el administrador.

**Resultado: 11 de 11 pasos correctos** (corrida final, versión `c38d4804`).

| # | Paso | Resultado |
|---|---|---|
| 1 | La empleada inicia sesión en la tablet y ve el catálogo | ✅ 28 productos de venta |
| 2 | La empleada solo ve Vender, Caja e Inventario (sin Dinero, Análisis ni Contabilidad) | ✅ |
| 3 | La tablet de la empleada no recibe costos (no aparecen en la página) | ✅ |
| 4 | Abrir caja con $50.000 | ✅ |
| 5 | Venta en línea: 2 Paleta Milky en efectivo, $22.000, paga con $50.000 | ✅ cambio $28.000 |
| 6 | El administrador entra desde el celular y ve la venta en Inicio | ✅ "Llevas $22.000 vendidos hoy" |
| 7 | **Sin internet**: la tablet sigue vendiendo (1 Quimbaya por Nequi) | ✅ |
| 8 | La tablet avisa "Trabajando sin conexión… Pendientes: 1" | ✅ |
| 9 | Al volver internet, la venta llega sola al celular (total $33.000) | ✅ |
| 10 | **Tiempo real**: una nueva venta aparece en el celular del administrador | ✅ en 2,4 segundos |
| 11 | Tras recargar los dos equipos, el total sigue en $44.000 (sin duplicados) | ✅ |

**Verificación en la base de datos después de la prueba** (SQL directo en Supabase):
- ventas: 3; total $44.000; pagos $44.000; suma de productos vendidos $44.000 → **cuadra**;
- por método: efectivo $33.000 + Nequi $11.000;
- inventario: 94 → **90** (Milky 10→8, Quimbaya 5→4, Brownie 6→5) → **cuadra**;
- caja: abierta con $50.000 en el equipo "Caja 1";
- equipos registrados: "Caja 1" y "Celular del administrador";
- operaciones rechazadas: 0; conflictos: 0.

Después se **borraron** esas 3 ventas, la caja y los equipos de prueba. El script está en `tests/e2e/produccion.mjs`.

Antes de llegar a 11/11, la misma prueba encontró **3 fallos reales** (sección 4), que se corrigieron y se volvieron a desplegar.

**Crear cuenta (prueba real en producción):** el administrador creó una cuenta con la función `invite-user` ✅; esa cuenta inició sesión como empleado del negocio ✅; la empleada intentó crear una cuenta de administrador y el servidor lo rechazó ✅. La cuenta de prueba se borró.

### 3.2 Seguridad comprobada en el servidor real (SQL con la sesión de cada rol)
| Comprobación | Resultado |
|---|---|
| El empleado lee costos (documentos) | 0 filas ✅ |
| El empleado lee costos (tabla) | 0 filas ✅ |
| El empleado lee la configuración (gastos fijos) | 0 filas ✅ |
| El empleado lee productos | 38 ✅ |
| Inventario visible para el empleado | 94 unidades (igual al Excel) ✅ |
| El empleado intenta cambiar un producto | Rechazado por el servidor: "sin permiso para productos" ✅ |
| Permisos del rol anónimo sobre las tablas | 0 ✅ |
| Asesor de seguridad de Supabase | Sin errores. Quedan 4 avisos (abajo) |

- **3 avisos intencionales:** `oli_apply`, `oli_bootstrap` y `oli_me` los puede ejecutar cualquier usuario con sesión. Es a propósito: son la **única puerta de escritura** y validan rol, organización y dispositivo por dentro.
- **1 aviso pendiente:** la protección contra contraseñas filtradas está apagada. Se activa en Supabase → Authentication → Passwords → "Leaked password protection" (desde la herramienta no se puede).

### 3.3 Pruebas de base de datos (PostgreSQL local, mismo esquema)
`sh supabase/tests/run.sh` → **45/45 OK**. Cubre:
- idempotencia (la misma venta enviada dos veces se guarda una sola vez);
- unión sin pérdida entre dispositivos;
- permisos por rol;
- inventario con entradas;
- que el documento sea del dispositivo que escribe;
- que la auditoría no se pueda borrar;
- respuestas "stale";
- que el total de ventas cuadre con pagos y con productos.

### 3.4 Pruebas de la app (navegador automático, local)
| Suite | Resultado |
|---|---|
| Escenario "un día de mañana" (empleado + administrador, sin internet, caja, informes) | 24/24 ✅ |
| Regresiones de fallos ya corregidos | 8/8 ✅ |
| Pantallas: celular, tablet vertical y horizontal, portátil, escritorio | 9/9 ✅ |
| Exportaciones Excel / PDF / ZIP: totales cuadran con la pantalla | ✅ |
| Primera visita sin recargas inesperadas + actualización de versión controlada | ✅ |

---

## 4. Fallos encontrados hoy con la prueba real, y corregidos

1. **La pantalla de ingreso borraba lo que se escribía.** La app redibujaba la vista con cada cambio de estado. Ahora no se redibuja si la pantalla no cambió.
2. **La primera visita recargaba la página sola** al instalarse el modo app. Eso cortaba el ingreso. Además, una actualización pedida no recargaba. Ambos corregidos y probados.
3. **El administrador entraba en "Vender" en vez de "Inicio"** después de iniciar sesión. Corregido.
4. **El esquema no se podía aplicar en Supabase**: las sentencias grandes con borrados quedaban esperando una confirmación. La proyección se dividió en dos funciones y los borrados pasaron a funciones auxiliares. Las 45 pruebas siguen pasando.
5. Las funciones internas tenían `search_path` variable (aviso del asesor de Supabase). Corregido.

6. **No había forma de crear cuentas de empleados desde la app.** La función del servidor (`invite-user`) existía, pero ningún botón la usaba. Ahora Equipo tiene **"Crear cuenta"** (correo, contraseña y rol). Además, la ayuda ya no menciona el botón "Compartir" de Claude cuando OLI corre en su propio servidor.
7. **Punto de equilibrio corregido:** los gastos registrados como Arrendamiento, Nómina o Servicios ya no se restan dos veces (ya están en los gastos fijos), y los días que quedan se cuentan desde la fecha del calendario. Probado 4/4.
8. **Cobro en efectivo:** botón "Otro valor" con teclado y sugerencias de redondeo (antes solo exacto o billetes grandes). Probado 7/7.
9. **Cerrar sesión** en el menú, en Más opciones y en la Ayuda. Probado con el simulador de servidor 7/7.
10. **Botón "Instalar OLI"** con los pasos según el equipo (iPad/Safari, Samsung Internet, Chrome Android, computador).

---

## 4b. Incidente del 5/10/2026 (provocado por mí, ya resuelto)

> **Actualización:** el dueño confirmó que esa venta y esa caja eran **una prueba suya**, no ventas del negocio. A su pedido se borraron del servidor. Producción quedó con 0 ventas, 0 cajas, 94 unidades y 2 cuentas.

Al limpiar los datos de prueba de las grabaciones del video, borré por error una **venta real** hecha desde el "Computador": `Computador #1`, $24.500 con tarjeta (1 Paleta Milky, 1 Capuchino, 1 Granizado Mango 9 oz). También borré la apertura de caja de esa sesión ($200.000) y sus registros de auditoría.

- **Qué se borró:** la copia sincronizada (documentos `ventas` y `cajas`), los registros de equipos y la auditoría de esa sesión.
- **Qué no se borró:** la venta, sus productos, el pago y la caja seguían en las tablas del servidor.
- **Restauración:** se reconstruyeron los dos documentos con los mismos identificadores y valores. Inventario: 93 (94 − 1 Milky). Quedó constancia en la auditoría (`DATOS_RESTAURADOS`).
- **No recuperable:** los registros de auditoría de esa sesión.
- **Mejora:** el administrador restaura ventas y cajas perdidas también desde la primera carga, con su prueba de regresión (9/9). La prueba mostró que en ese caso la app ya se habría autocorregido al abrir OLI, así que el cambio es un refuerzo, no la corrección de una falla activa.
- **Regla desde ahora:** no se borra nada en producción sin revisar antes qué datos son de prueba y cuáles son del negocio. Las grabaciones futuras deben usar datos de ejemplo locales, no producción.

---

## 5. Limitaciones y pendientes (honesto)

- **PENDIENTE: prueba en una tablet física.** Todo se probó con navegadores automáticos que simulan tablet y celular. Falta abrirlo en la tablet real del negocio.
- **PENDIENTE: valores de luz, agua e internet.** Están en $0 y el punto de equilibrio sale más bajo de lo real hasta que se llenen (Ajustes → gastos fijos).
- **PENDIENTE: inventario de agua, soda y galleta.** Hay que hacer un conteo inicial en Inventario.
- **Facturación electrónica DIAN: NO conectada.** OLI no emite facturas electrónicas ni documentos soporte válidos ante la DIAN. La pantalla de Contabilidad organiza la información para el contador. **OLI no garantiza cumplimiento tributario.** Las tarifas de impuesto de cada producto están en "validar" (no se asumieron por el nombre del producto).
- **Validación de precios y anulaciones en el servidor:** el servidor valida permisos, dueño del documento e idempotencia. **No recalcula** el precio de cada venta ni valida reglas de anulación: eso se hace en la app.
- **Reloj del dispositivo:** si un equipo tiene la hora muy mal, el orden entre un conteo de inventario y las ventas de ese equipo puede quedar mal. El servidor detecta inventarios negativos y los marca para revisión.
- **Registro abierto en Supabase:** cualquiera que conozca la dirección podría crear una cuenta y "crear su negocio" (separado, sin acceso a los datos de OLI). Se recomienda desactivar el registro público en Supabase → Authentication → Sign In / Providers → "Allow new users to sign up".
- **Plan gratuito de Supabase:** el proyecto se pausa tras 7 días sin uso y tiene límites de almacenamiento. Para uso diario continuo conviene revisar el plan.
- **El video** usa datos de demostración, un servidor de prueba local y no tiene voz (ver `OLI_Tutorial_Script.md`).
- **La versión en Claude (artifact)** usa otra base de datos. Lo que se haga allí **no** aparece en oli-pos.vercel.app, y al revés.

---

## 6. Cómo instalar OLI en la tablet

1. Abrir **Chrome** en la tablet y entrar a **https://oli-pos.vercel.app**.
2. Ingresar con la cuenta de empleado.
3. Menú de Chrome (⋮) → **Instalar aplicación** (o "Agregar a pantalla de inicio").
4. Queda un ícono **OLI**. Funciona sin internet una vez abierta la primera vez con conexión.
