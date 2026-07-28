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

## Operaciones aplazadas

No hay flujo de carga, descarga o estado sintético de evidencia hasta que exista
un proceso aprobado de análisis y cuarentena. Tampoco hay autorización regional,
unidades, consejeros, notificaciones, exportaciones, recuperación de cuenta,
se explican en `/operaciones-no-disponibles`; no se muestran controles desactivados
ni rutas que simulen disponibilidad.

## Pantallas privilegiadas bloqueadas

`/club`, `/students`, `/audit` y `/assessments` permanecen sin publicar hasta
que un DBA ejecute y registre de forma redactada los controles de propiedad,
ACL y `SECURITY DEFINER` de los comandos 024/025 descritos en
`SECURITY_ROLE_ALIGNMENT_RUNBOOK.md`. Un resultado pendiente o fallido no se
compensa con navegación oculta ni autorizaciones del cliente.

## PWA y soporte

El worker sólo almacena `/offline.html` y recursos mismos de `/_next/static/`.
Documentos protegidos, RPC, API, evidencia, respuestas POST y mutaciones son de
red y no admiten operaciones sin conexión. Para validar evidencia o resolver una
operación aplazada, contacte presencialmente al responsable autorizado del club.
