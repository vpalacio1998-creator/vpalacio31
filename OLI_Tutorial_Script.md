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


---

# Versión narrada (voz Gonzalo, Colombia) · estilo Claude Design

**Archivo:** `OLI_Tutorial_Gonzalo.mp4` · 3 min 2 s · 1920×1080 · H.264 + AAC · 22,9 MB
**Dónde está:** almacenamiento privado de Supabase (bucket `exports`, carpeta de la organización). El enlace de descarga se entregó por chat y vence en un año. **No se publica aquí** porque el repositorio es público y el video muestra pantallas de administrador con costos.

- **Imágenes reales** de https://oli-pos.vercel.app con el catálogo del Excel. La empleada usó una tablet de 1180×820, el administrador un celular de 390×844 y también un computador.
- **Voz** `es-CO-GonzaloNeural` (Microsoft Edge TTS). No existe una voz "Alberto" disponible.
- **Datos de la grabación:** 2 ventas de prueba (efectivo $25.500 y Nequi $6.500) y una caja cerrada sin diferencia. **Se borraron** de producción al terminar.
- **Revisión automática:** 18 de 18 láminas sin choques de texto, sin elementos fuera del cuadro, con fuentes cargadas y capturas con contenido.
- **Cómo regenerarlo:** `tools/video/LEEME.md`.

| # | Escena | Narración |
|---|---|---|
| 1 | OLI: Tu paletería, en orden. | Hola. Te presento OLI, el sistema de tu paletería. Con OLI vendes, controlas el inventario y la caja, y sabes qué hacer cada día para que el negocio crezca. |
| 2 | Instalar: Una app en tu tablet | Primero, instálalo en la tablet. Abre oli-pos punto vercel punto app y toca el botón Instalar OLI. |
| 3 | Instalar: Pasos para tu equipo | OLI te muestra los pasos para tu equipo. En el iPad, desde Safari, tocas Compartir y luego Agregar a inicio. Queda el ícono de OLI, a pantalla completa. |
| 4 | Empleado: Cada persona con su cuenta | Cada persona entra con su propia cuenta. La empleada escribe su correo y su contraseña, y OLI sabe qué puede ver y qué no. |
| 5 | Empleado: Solo lo que necesita | La empleada solo ve lo que necesita: Vender, Caja e Inventario. Los costos, las ganancias y los gastos del negocio nunca llegan a su tablet. |
| 6 | Caja: Abrir la caja | Antes de vender, abre la caja con el efectivo de base. Así queda registrado con cuánto empezó el día. |
| 7 | Vender: Tocar y listo | Vender es tocar los productos. Dos paletas Milky y un café. El pedido se arma solo, a la derecha. |
| 8 | Cobrar: OLI calcula el cambio | Al cobrar, eliges cómo paga el cliente. Si paga en efectivo, OLI calcula el cambio. También recibe Nequi, Daviplata, tarjeta y QR. |
| 9 | Vender: Venta registrada | Venta registrada. El inventario se descuenta automáticamente, sin hacer nada más. |
| 10 | Sin internet: Se cae internet, no se para | ¿Y si se cae internet? Se sigue vendiendo. OLI avisa que trabaja sin conexión, guarda las ventas en la tablet y las envía solas cuando vuelve la señal. Nada se pierde y nada se duplica. |
| 11 | Administrador: Todo, desde tu celular | Mientras tanto, desde tu celular ves todo en tiempo real. Cada venta de la tablet aparece aquí en un par de segundos, incluida la que se hizo sin internet. |
| 12 | Punto de equilibrio: ¿Ya cubriste el mes? | Y lo más importante: el punto de equilibrio. OLI suma tus gastos fijos del mes, como el arriendo y las trabajadoras, y te dice cuánto llevas cubierto, si vas al día y cuánto necesitas vender por día. |
| 13 | Inventario: Inventario al día | El inventario siempre está al día. OLI te avisa qué se está acabando antes de que te quedes sin producto. |
| 14 | Compras: ¿Qué debo pedir? | En Compras, OLI calcula cuánto pedir de cada producto según lo que realmente vendes. Es una recomendación: tú siempre decides. |
| 15 | Cierre: Cerrar la caja | Al final del día, la empleada cuenta el efectivo y cierra la caja. OLI ya sabe cuánto debería haber y muestra si hay alguna diferencia. |
| 16 | Cierre: Todo queda registrado | El cierre queda registrado: quién cerró, a qué hora, cuánto había y la diferencia. |
| 17 | Informes: Informes para ti y tu contador | Y en el computador descargas informes en Excel y en PDF, para ti y para tu contador, con totales que cuadran con lo que ves en pantalla. |
| 18 | OLI: OLI te dice qué hacer. | OLI no solo te muestra información: te dice qué deberías hacer. OLI, software de VP Visual Project, creado por Víctor Palacio. |
