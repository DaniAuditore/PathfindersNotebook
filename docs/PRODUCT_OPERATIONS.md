# Operación del producto

## Límites de autoridad

Las páginas protegidas se renderizan en el servidor con la sesión autenticada y
lecturas de Supabase sujetas a RLS. La interfaz no realiza DML de tablas desde
el navegador, no decide permisos en el cliente y no conserva datos protegidos
sin conexión. Los formularios usan acciones de servidor que validan su entrada,
vuelven a autorizar el recurso y llaman al RPC indicado.

| Ruta | Lectura permitida | Acción permitida | Límites visibles |
| --- | --- | --- | --- |
| `/dashboard` | Alumnos vinculados y totales agregados de clubes dirigidos o instruidos por el actor | Ninguna | Sin clasificaciones, identificadores ni datos de otros clubes. |
| `/classes` | Clubes con rol `CLUB_DIRECTOR`; procedencia, revisión y publicación de Amigo | `provision_official_amigo_catalog` | Sin creación genérica ni edición de catálogo. |
| `/enrollments` | Alumnos RLS-visibles de clubes de dirección y catálogo Amigo publicado | `enroll_official_amigo_student(target_student_id, target_school_year)` | El resultado idempotente indica si ya existía una inscripción. |
| `/students/[studentId]` | Alumno, inscripción, requisitos, intentos y revisiones RLS-visibles | `submit_progress_attempt` por la acción existente | No se ofrece texto para requisitos derivados, prácticos o de evidencia. |
| `/reviews` | Intentos enviados de clubes dirigidos o instruidos | `review_progress_attempt(target_progress_id, target_attempt_id, decision_input, reason_input)` | Los cambios solicitados requieren motivo; no se muestran filas fuera del alcance. |
| `/profile` | Sólo el nombre visible del actor | `update_own_profile(display_name_input)` | No muestra roles ni perfiles ajenos. |
| `/students` | Nombre y año de nacimiento de alumnos de clubes dirigidos o instruidos | `create_or_update_student(target_student_id, target_club_id, display_name_input, birth_year_input, null, null)` | Sin identificadores visibles, vínculos de cuentas ni tutela. |
| `/club` | Nombre de clubes donde el actor es director | `update_club(target_club_id, name_input)` | Sólo dirección activa; no crea clubes. |
| `/audit` | Acción, tipo de entidad, momento y etiqueta de actor reducida; 25 por página | Ninguna | Nunca muestra metadatos, IDs, perfiles, correo ni cargas. |
| `/assessments` | Inscripciones RLS-visibles de clubes dirigidos o instruidos, progreso agregado y estado actual | `record_assessment`, `record_investiture` | El evaluador asignado no se expone hasta contar con una lectura aprobada; el RPC verifica alcance y precondiciones. |
| `/members` | Dirección: miembros, unidades, condición derivada y remediaciones de su club. Administración del sistema: sólo metadatos de rotación. | Registro, remediación, unidad, traslado, asignación/revocación, retiro y rotación auditados por RPC. | La contraseña temporal se muestra una única vez; no se muestra alias, evidencia, tarjetas ni datos de otro club. Consejero: una unidad; instructor: varias. |

## Operaciones aplazadas

No hay flujo de carga, descarga o estado sintético de evidencia hasta que exista
un proceso aprobado de análisis y cuarentena. Tampoco hay autorización regional,
unidades, consejeros, notificaciones, exportaciones, recuperación de cuenta,
se explican en `/operaciones-no-disponibles`; no se muestran controles desactivados
ni rutas que simulen disponibilidad.

## Membresía v2 y pantallas privilegiadas

La condición Conquistador/Líder se deriva de la fecha completa de nacimiento al
inicio del día local del club; no es un rol asignable. Una membresía pendiente
de remediación no recibe acceso operativo hasta que la dirección complete fecha
de nacimiento y unidad. Retirar revoca acceso y conserva el historial. La
rotación de dirección sólo la realiza `SYSTEM_ADMIN`, exige motivo auditado y
deja a la dirección saliente únicamente como Líder sin asignaciones de personal.
`SYSTEM_ADMIN` no recibe lectura de tarjetas, progreso, contenido sensible ni
evidencia.

La evidencia redactada del control efectivo de propiedad, ACL y `SECURITY
DEFINER` de los comandos 024/025 está aprobada para las pantallas `/club`,
`/students`, `/audit` y `/assessments`: los 18 RPC pertenecen al propietario de
comandos, `anon` no puede ejecutarlos y ningún rol de aplicación puede asumir
ese propietario. La navegación sólo orienta; cada ruta, lectura y acción vuelve
a comprobar sesión, alcance canónico y RLS. `SYSTEM_ADMIN` no recibe por ello
acceso implícito a evidencia.

No se ofrece gestión de roles: aunque existen comandos de asignación y
revocación, el contrato no autoriza un directorio seguro ni una selección de
destinatario sin UUID. No se piden UUID libres ni se muestran asignaciones de
otras personas.

## PWA y soporte

El worker sólo almacena `/offline.html` y recursos mismos de `/_next/static/`.
Documentos protegidos, RPC, API, evidencia, respuestas POST y mutaciones son de
red y no admiten operaciones sin conexión. Para validar evidencia o resolver una
operación aplazada, contacte presencialmente al responsable autorizado del club.
