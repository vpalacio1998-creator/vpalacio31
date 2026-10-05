# OLI · Guion del video tutorial

**Archivo:** `OLI_Tutorial.mp4` · 5 min 13 s · 1600×900 · H.264 · 10 MB · sin voz (subtítulos en pantalla)
**OLI · Software propiedad de VP Visual Project · Creado por Víctor Palacio**

## Cómo se grabó (para que nadie se confunda)

- Es la **interfaz real de OLI** (el mismo código que está en https://oli-pos.vercel.app), grabada con un navegador automático.
- Se ven **tres equipos a la vez**: la tablet de la empleada, el celular del administrador y el computador del administrador.
- Los datos son de **demostración** (Paleta Mango, Paleta Fresa…): **no son las ventas reales del negocio**. El catálogo real (el del Excel) ya está cargado en producción, pero el video se grabó antes, con el catálogo de ejemplo.
- La sincronización del video se hizo contra un **servidor de prueba local**, no contra Supabase. La prueba real contra Supabase está en `OLI_Final_Audit.md`.
- **No tiene narración de voz.** La voz sintética disponible sonaba robótica, así que se dejó con subtítulos grandes.

## Escenas

| Tiempo | Tema | Lo que se ve / dice el subtítulo |
|---|---|---|
| 0:00 | OLI | La empleada vende, OLI registra, el inventario se actualiza, la caja se controla, el administrador ve todo y OLI recomienda qué hacer. |
| 0:09 | Empleado | La empleada abre OLI en la tablet. Solo ve lo que necesita: Vender, Caja e Inventario. |
| 0:13 | Empleado | Lo primero: abrir la caja con el efectivo de base. |
| 0:18 | Empleado | Vender es muy fácil: se tocan los productos. |
| 0:22 | Empleado | Se puede cambiar la cantidad o quitar un producto del pedido. |
| 0:26 | Empleado | Al cobrar se elige cómo paga el cliente. En efectivo, OLI calcula el cambio. |
| 0:33 | Empleado | Venta registrada. También acepta Nequi, Daviplata, tarjeta y QR. |
| 1:28 | Inventario | Cada venta descuenta el inventario sola. OLI avisa qué se está acabando. |
| 1:37 | Tiempo real | Mientras la empleada vende, el administrador ve todo desde su celular, sin recargar. |
| 1:45 | Tiempo real | La venta aparece al instante en el celular: ventas de hoy, ticket e inventario. |
| 1:50 | Sin internet | Si se cae Internet, se puede seguir vendiendo. Nada se pierde. |
| 3:36 | Sin internet | La tablet muestra “Sin conexión · 2 por enviar”. Las ventas quedan guardadas en el equipo. |
| 3:40 | Sincronización | Cuando vuelve Internet, OLI sincroniza automáticamente, sin duplicados. |
| 3:45 | Sincronización | El celular del administrador recibe las ventas que se hicieron sin Internet. |
| 3:50 | Administrador | En el celular, el Centro de Comando responde: ¿cómo va OLI y qué está pasando? |
| 3:58 | Administrador | ¿Qué debería hacer? Cada recomendación explica por qué. |
| 4:06 | Compras | “¿Qué debo pedir?”: OLI calcula cuánto comprar según ventas, inventario, tendencia y fin de semana. |
| 4:17 | Inventario | El inventario está al día en el celular: lo que se vendió en la tablet ya se descontó. |
| 4:22 | Caja | Al final del día, la empleada cierra la caja. OLI sabe cuánto efectivo debería haber. |
| 4:32 | Caja | La caja cuadró. El cierre queda registrado: quién, cuándo, cuánto y la diferencia. |
| 4:39 | Informes | En el computador, el administrador descarga informes en Excel y PDF, y el paquete para el contador. |
| 4:46 | Informes | Los totales cuadran entre la pantalla, el Excel y el PDF. |
| 4:53 | Contabilidad | Contabilidad organiza la información para el contador, sin prometer cumplimiento automático. |
| 4:58 | OLI | OLI no solo muestra información. Te dice qué deberías hacer. |
| 5:04 | Cierre | OLI. Software propiedad de VP Visual Project. Creado por Víctor Palacio. |

## Limitaciones conocidas del video

- Entre 1:50 y 3:36 hay un tramo largo sin subtítulo nuevo: la tablet sigue vendiendo sin internet mientras se registran las ventas pendientes. Se puede recortar en edición.
- No aparece la pantalla de ingreso con correo y contraseña (el video se grabó con el modo de prueba, que entra directo).
- No aparece el punto de equilibrio con los gastos fijos reales (se agregó después de grabar).
