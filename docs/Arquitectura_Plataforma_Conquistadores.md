# Arquitectura de la Plataforma de Progreso para Clubes de Conquistadores

## Resumen ejecutivo

La arquitectura recomendada es:

> **Monolito modular orientado al dominio, desplegado como aplicación serverless en Vercel y respaldado por Supabase como plataforma administrada de datos, autenticación y almacenamiento.**

La idea de que «un sistema monolítico es menos escalable» necesita matiz. Un monolito mal estructurado escala mal; un **monolito modular** puede soportar perfectamente uno o varios clubes, miles de usuarios y múltiples tarjetas. En este proyecto, partir con una arquitectura distribuida sería sobrearquitectura: agregaría más despliegues, fallos posibles, autenticación entre servicios, colas, observabilidad y costos sin resolver una necesidad real.

La escalabilidad relevante en esta etapa no consiste en distribuir servidores, sino en poder agregar nuevas clases, versiones, secciones, requisitos, modalidades de evidencia, clubes y reglas de aprobación sin modificar la lógica central cada vez.

---

# 1. Alcance funcional de la tarjeta Amigo

La tarjeta Amigo no contiene solamente una lista lineal de requisitos. Tiene una estructura que el software debe representar explícitamente.

La clase regular está dividida en nueve áreas:

1. Generales.
2. Descubrimiento espiritual.
3. Sirviendo a los demás.
4. Desarrollo de la amistad.
5. Salud y aptitud física.
6. Organización y liderazgo.
7. Estudio de la naturaleza.
8. Arte de acampar.
9. Estilo de vida.

Además, contiene una clase avanzada llamada **Amigo de la Naturaleza**, con requisitos propios y una evaluación separada de la clase regular.

Esto obliga a distinguir al menos:

```text
Programa
└── Clase
    ├── Regular
    └── Avanzada
        └── Secciones
            └── Requisitos
                └── Opciones o subrequisitos
```

No conviene modelar «Amigo de la Naturaleza» como una tarjeta completamente independiente. Debe mantener una relación conceptual con la clase Amigo, pero conservar su propia inscripción, progreso y evaluación.

---

# 2. Problemas de dominio que deben resolverse

## 2.1. No todos los requisitos son equivalentes

La tarjeta mezcla:

- condiciones administrativas;
- memorización;
- lectura;
- actividades presenciales;
- trabajos escritos;
- especialidades;
- participación;
- requisitos con alternativas;
- requisitos con múltiples partes;
- requisitos que requieren firma externa.

Por ejemplo:

- «Tener como mínimo 10 años» no necesita una entrega.
- «Memorizar y explicar el Voto y la Ley» requiere evaluación oral o evidencia audiovisual.
- «Leer el libro del año» puede validarse mediante preguntas, conversación o aprobación presencial.
- «Dedicar dos horas ayudando a alguien» requiere participación y validación.
- «Completar una especialidad» depende de otro proceso formativo.
- «Aprender y armar tres tipos de carpas» debe demostrarse físicamente.
- «Completar una de las siguientes especialidades» contiene opciones mutuamente válidas.
- La lectura bíblica contiene decenas de capítulos que deben poder marcarse por separado.

Por ello, un requisito no puede representarse solamente así:

```text
id
nombre
completado
```

Necesita una definición más rica que describa su modalidad, regla de completitud, evidencias, criterios, dependencias y responsables de aprobación.

## 2.2. La firma física no equivale a subir un archivo

En la tarjeta, cada requisito tiene fecha y firma. Digitalmente deben transformarse en:

- fecha de aprobación;
- evaluador;
- modalidad de cumplimiento;
- observaciones;
- evidencia;
- historial;
- firma lógica o validación institucional.

## 2.3. La evaluación final es distinta del avance

La tarjeta contempla:

- evaluación regular;
- evaluación avanzada;
- instructor o evaluador;
- director del club;
- autorización regional para investidura.

Completar todos los requisitos no debería cambiar automáticamente la clase a «investida».

El flujo correcto sería:

```text
Requisitos aprobados
        ↓
Clase lista para evaluación
        ↓
Evaluación del instructor
        ↓
Validación del director
        ↓
Autorización para investidura
        ↓
Clase investida
```

---

# 3. Arquitectura recomendada

## 3.1. Estilo arquitectónico: monolito modular

El sistema será una sola aplicación desplegable, dividida internamente en módulos independientes.

```text
Aplicación Next.js
├── Identidad y acceso
├── Clubes y membresías
├── Clases y tarjetas
├── Inscripciones
├── Requisitos y actividades
├── Entregas
├── Evaluaciones
├── Tareas
├── Notificaciones
├── Archivos
├── Informes
└── Auditoría
```

Todos los módulos vivirán inicialmente en el mismo repositorio y despliegue. Sin embargo, no deberían acceder directamente a las tablas o detalles internos de otros módulos sin pasar por contratos definidos.

Esto permite extraer un módulo a un servicio independiente en el futuro, pero solamente cuando exista una razón real.

## 3.2. Técnica arquitectónica: descomposición modular por dominio

La técnica principal consiste en dividir el sistema según capacidades del negocio, no según pantallas, tablas o tipos de archivo.

Una separación insuficiente sería:

```text
controllers/
services/
repositories/
components/
```

Esta distribución agrupa por tecnología y termina mezclando responsabilidades.

La separación recomendada es:

```text
modules/
├── identity/
├── clubs/
├── classes/
├── enrollments/
├── requirements/
├── submissions/
├── assessments/
├── assignments/
├── notifications/
└── audit/
```

Dentro de cada módulo se aplican sus propias capas:

```text
submissions/
├── domain/
├── application/
├── infrastructure/
└── presentation/
```

### Técnicas complementarias

#### Separación de responsabilidades

La lógica de aprobación no debe vivir en componentes React ni en consultas SQL dispersas.

#### Encapsulamiento de módulos

El módulo de entregas no debería modificar directamente una evaluación final.

#### Inversión de dependencias

El dominio no debería depender directamente de Supabase, Vercel o un proveedor de correo.

#### Diseño orientado al dominio ligero

No es necesario aplicar DDD completo, pero sí modelar conceptos reales:

- tarjeta;
- versión;
- inscripción;
- requisito;
- actividad;
- entrega;
- revisión;
- evaluación;
- investidura.

#### Contratos explícitos

Cada módulo debe publicar operaciones concretas:

```text
enrollStudent()
submitRequirement()
approveSubmission()
requestCorrection()
recordManualCompletion()
closeClassEvaluation()
```

## 3.3. Patrón arquitectónico: capas con orientación hexagonal

El sistema seguirá cuatro capas dentro de cada módulo:

```text
┌──────────────────────────────┐
│ Presentación                 │
│ Páginas, componentes y API   │
├──────────────────────────────┤
│ Aplicación                   │
│ Casos de uso                 │
├──────────────────────────────┤
│ Dominio                      │
│ Reglas y entidades           │
├──────────────────────────────┤
│ Infraestructura              │
│ Supabase, Storage y correo   │
└──────────────────────────────┘
```

### Dominio

Contiene las reglas que deben seguir siendo válidas aunque se cambie Supabase por otro proveedor.

Ejemplos:

- una entrega aprobada no puede editarse;
- solo un instructor autorizado puede evaluar;
- una clase no puede quedar lista para investidura con requisitos obligatorios pendientes;
- un requisito presencial no puede aprobarse únicamente mediante texto;
- una opción alternativa aprobada satisface el grupo de alternativas;
- la clase avanzada puede requerir que la regular esté activa o completada.

### Aplicación

Coordina los casos de uso:

```text
Enviar requisito
Revisar entrega
Solicitar corrección
Registrar cumplimiento presencial
Asignar actividad
Calcular progreso
Solicitar evaluación final
Autorizar investidura
```

### Infraestructura

Implementa las conexiones con:

- Supabase PostgreSQL;
- Supabase Auth;
- Supabase Storage;
- correo;
- exportación a PDF;
- futuras integraciones.

### Presentación

Incluye:

- panel del conquistador;
- panel del instructor;
- panel del director;
- rutas API;
- acciones del servidor;
- formularios.

---

# 4. Por qué no utilizar microservicios inicialmente

Una arquitectura distribuida sería justificable si existieran:

- múltiples equipos desarrollando módulos diferentes;
- cientos de clubes con alta carga;
- procesamiento intensivo de video;
- integraciones institucionales complejas;
- cargas muy distintas entre módulos;
- necesidades de aislamiento regulatorio;
- despliegues independientes frecuentes.

Actualmente esos problemas no existen.

Con microservicios también sería necesario resolver:

- comunicación entre servicios;
- consistencia de datos;
- autenticación interna;
- trazabilidad distribuida;
- reintentos;
- duplicación de eventos;
- despliegues múltiples;
- manejo de secretos;
- colas;
- monitoreo.

La complejidad adicional no entregaría una ventaja proporcional.

## Escalabilidad del monolito modular

La aplicación puede escalar mediante:

- múltiples instancias serverless en Vercel;
- PostgreSQL administrado;
- CDN para contenido estático;
- almacenamiento separado;
- consultas indexadas;
- paginación;
- procesos asíncronos;
- caché cuando sea necesario.

Es probable que las primeras limitaciones aparezcan en:

- almacenamiento de videos;
- consultas mal diseñadas;
- políticas RLS complejas;
- procesamiento de archivos;
- falta de índices.

El principal problema no será que la aplicación sea monolítica.

---

# 5. Stack tecnológico

## 5.1. Frontend y servidor

**Next.js con TypeScript**, desplegado en Vercel.

Se puede utilizar:

- Server Components para consultas;
- Server Actions o Route Handlers para operaciones sensibles;
- interfaz responsive;
- PWA en una fase posterior.

Vercel permite ejecutar código del servidor sin administrar una VPS y Next.js posee integración directa con la plataforma.

Referencia: [Vercel Functions](https://vercel.com/docs/functions)

## 5.2. Backend administrado

**Supabase** se utilizará para:

- PostgreSQL;
- autenticación;
- almacenamiento de archivos;
- políticas de acceso;
- funciones específicas;
- eventos en tiempo real, solo donde aporten valor.

Supabase Auth trabaja con tokens y se integra con las políticas RLS de PostgreSQL.

Referencia: [Row Level Security en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 5.3. Archivos

Se recomienda **Supabase Storage**, en lugar de Vercel Blob, para mantener usuarios, permisos y archivos bajo el mismo sistema.

Buckets sugeridos:

```text
avatars
submission-evidence
class-resources
club-documents
```

Las evidencias deben mantenerse en buckets privados. El usuario no debe recibir una URL pública permanente; el sistema debe generar accesos temporales y validar quién puede visualizar cada archivo.

El plan gratuito de Supabase dispone de una capacidad limitada. Puede ser suficiente para un club pequeño, pero se agotará rápidamente si se permiten videos sin restricciones.

Referencia: [Precios de Supabase Storage](https://supabase.com/docs/guides/storage/pricing)

## 5.4. Distribución de la lógica

No es necesario crear un backend separado con Spring Boot, Express, NestJS o FastAPI en la primera versión.

La distribución será:

- consultas normales: cliente Supabase protegido mediante RLS;
- operaciones administrativas: funciones de servidor de Next.js;
- acciones críticas o integraciones: Supabase Edge Functions;
- tareas programadas: Vercel Cron o procesos programados externos.

Las claves administrativas de Supabase nunca deben quedar en el navegador, porque la clave `service_role` omite las políticas RLS.

Referencia: [Secretos en Supabase Edge Functions](https://supabase.com/docs/guides/functions/secrets)

---

# 6. Módulos del sistema

## 6.1. Identidad y acceso

Responsabilidades:

- autenticación;
- perfiles;
- recuperación de contraseña;
- activación y suspensión;
- consentimiento de apoderados;
- roles;
- permisos.

Roles iniciales:

```text
SYSTEM_ADMIN
CLUB_DIRECTOR
INSTRUCTOR
COUNSELOR
PATHFINDER
GUARDIAN
EVALUATOR
```

No conviene guardar un único campo `role` en el perfil. Una persona podría ser instructor en un club y director en otro.

Se utilizarán membresías:

```text
user
club
role
unit
status
```

## 6.2. Clubes y unidades

Responsabilidades:

- datos del club;
- periodos anuales;
- unidades;
- consejeros;
- miembros;
- asignaciones.

Aunque inicialmente exista un solo club, las entidades del negocio deberían incluir `club_id`. Esto no convierte automáticamente el producto en multiclub, pero evita rediseñar la base de datos en el futuro.

### Membresía operativa v2

La identidad operativa se modela con `club_members`, una asignación histórica de
unidad activa por miembro y asignaciones históricas de personal. La condición
**Conquistador/Líder** se calcula desde fecha de nacimiento completa y zona
horaria IANA del club; nunca se asigna como rol. `INSTRUCTOR` puede trabajar en
varias unidades; `COUNSELOR` en una sola, aunque una unidad puede tener varios
consejeros. La dirección es única por club y su rotación atómica requiere a
`SYSTEM_ADMIN`, motivo auditado y elimina las asignaciones de personal de la
dirección saliente. La administración de sistema opera sólo metadatos de
gobierno: no recibe tarjetas, avance, contenido sensible ni evidencias.

## 6.3. Catálogo de clases

Responsabilidades:

- clases regulares;
- clases avanzadas;
- versiones;
- secciones;
- requisitos;
- actividades;
- criterios;
- dependencias;
- publicación.

Debe distinguir:

```text
Clase: Amigo
Nivel: Regular

Clase: Amigo de la Naturaleza
Nivel: Avanzada
Clase relacionada: Amigo
```

## 6.4. Inscripciones

Responsabilidades:

- asignar tarjeta;
- definir instructor;
- registrar fecha de inicio;
- suspender;
- trasladar;
- completar;
- cerrar.

Un conquistador puede tener varias inscripciones históricas. Para el MVP se recomienda permitir, como máximo:

> Una tarjeta regular activa y una tarjeta avanzada relacionada.

## 6.5. Requisitos y actividades

Tipos de requisito:

```text
ADMINISTRATIVE
MEMORIZATION
READING
WRITTEN_WORK
PRACTICAL_DEMONSTRATION
PARTICIPATION
SPECIALTY
BIBLE_READING
ORAL_EVALUATION
GROUP_ACTIVITY
FINAL_ASSESSMENT
```

Cada requisito puede aceptar una o varias modalidades:

```text
TEXT
FILE
IMAGE
AUDIO
VIDEO
LINK
QUIZ
CHECKLIST
IN_PERSON_VALIDATION
EXTERNAL_SPECIALTY
ATTENDANCE
```

## 6.6. Entregas

Responsabilidades:

- borradores;
- respuestas;
- archivos;
- reenvíos;
- comentarios;
- historial.

Una entrega corregida no debe sobrescribir la anterior. Se guardarán intentos:

```text
Entrega 1 → requiere corrección
Entrega 2 → aprobada
```

## 6.7. Revisión y aprobación

Estados sugeridos:

```text
NOT_STARTED
IN_PROGRESS
DRAFT
SUBMITTED
UNDER_REVIEW
CHANGES_REQUESTED
RESUBMITTED
APPROVED
MANUALLY_APPROVED
EXEMPTED
CANCELLED
```

Decisiones del revisor:

```text
APPROVE
REQUEST_CHANGES
REJECT
MARK_COMPLETED_IN_PERSON
```

No se recomienda un estado general «parcialmente aprobado». Para requisitos compuestos es preferible dividir el requisito en subrequisitos.

## 6.8. Evaluación de clase

Responsabilidades:

- comprobar requisitos obligatorios;
- registrar evaluación del instructor;
- validar al director;
- registrar autorización regional;
- declarar investidura.

Estados:

```text
IN_PROGRESS
REQUIREMENTS_COMPLETED
READY_FOR_ASSESSMENT
ASSESSED
DIRECTOR_APPROVED
REGIONAL_AUTHORIZED
INVESTED
```

## 6.9. Tareas

Los instructores podrán crear tareas asociadas a requisitos.

Ejemplo:

> Completar el requisito 2.1 antes del 15 de agosto.

Una tarea puede incluir:

- destinatario individual;
- unidad completa;
- tarjeta;
- requisito;
- instrucciones adicionales;
- fecha sugerida;
- prioridad;
- archivo adjunto.

La tarea no debe duplicar el progreso. Debe apuntar a un requisito, cuya aprobación ocurre en el módulo de requisitos.

No se recomienda bloquear las entregas después de la fecha. En un club formativo, la fecha debe orientar, no funcionar como castigo automático.

## 6.10. Notificaciones

Para la primera versión:

- notificaciones dentro de la plataforma;
- contador de entregas pendientes;
- aviso cuando una entrega sea revisada.

En fases posteriores:

- correo al instructor por nuevas entregas;
- resumen semanal;
- recordatorio de correcciones;
- aviso al apoderado;
- notificación por WhatsApp, solamente si existe consentimiento y una necesidad real.

No se recomienda comenzar con WhatsApp. Aumentaría la complejidad, los costos y el tratamiento de datos sin resolver la función principal.

## 6.11. Auditoría

Toda acción sensible debe registrar:

- quién actuó;
- qué hizo;
- cuándo;
- sobre qué registro;
- valor anterior;
- valor nuevo;
- motivo.

Esto es especialmente importante para:

- aprobaciones manuales;
- cambios de rol;
- modificaciones de tarjetas;
- eliminación de evidencias;
- reapertura de requisitos;
- autorización de investidura.

---

# 7. Patrones de diseño

Los patrones deben aplicarse cuando resuelvan problemas concretos, no solamente para completar una lista.

## 7.1. Repository

Abstrae el acceso a datos:

```ts
interface SubmissionRepository {
  findById(id: string): Promise<Submission | null>;
  save(submission: Submission): Promise<void>;
  findPendingForReviewer(reviewerId: string): Promise<Submission[]>;
}
```

Beneficios:

- evita consultas Supabase dispersas;
- facilita pruebas;
- permite cambiar la persistencia.

No debe crearse un repositorio genérico universal. Se utilizarán repositorios por agregado o módulo.

## 7.2. Application Service

Representa un caso de uso:

```ts
class ApproveSubmissionService {
  async execute(command: ApproveSubmissionCommand): Promise<void> {
    // Validar permisos.
    // Cargar entrega.
    // Aplicar reglas.
    // Guardar revisión.
    // Actualizar progreso.
    // Emitir evento.
  }
}
```

Se deben evitar servicios gigantes con cientos de métodos.

## 7.3. State

Es adecuado para el ciclo de vida de entregas y evaluaciones:

```text
DRAFT → SUBMITTED → UNDER_REVIEW
UNDER_REVIEW → APPROVED
UNDER_REVIEW → CHANGES_REQUESTED
CHANGES_REQUESTED → RESUBMITTED
```

Una máquina de estados explícita evita transiciones inválidas, como:

```text
APPROVED → DRAFT
```

## 7.4. Strategy

Los requisitos se validan de formas diferentes:

```ts
interface RequirementCompletionStrategy {
  validate(
    requirement: Requirement,
    submission: Submission
  ): ValidationResult;
}
```

Implementaciones:

```text
WrittenWorkStrategy
MemorizationStrategy
AttendanceStrategy
PracticalDemonstrationStrategy
SpecialtyCompletionStrategy
BibleReadingStrategy
ManualValidationStrategy
```

Este patrón será central para representar la tarjeta Amigo.

## 7.5. Factory

Crea actividades, validadores o formularios según el tipo de requisito:

```ts
RequirementActivityFactory.create(requirement.type);
```

Ejemplos:

- `WRITTEN_WORK` genera un editor de texto y archivos;
- `MEMORIZATION` permite audio, video o validación presencial;
- `ATTENDANCE` no muestra un formulario al conquistador;
- `BIBLE_READING` genera una lista de capítulos.

## 7.6. Specification

Permite expresar reglas combinables:

```text
StudentHasMinimumAge
StudentIsActiveMember
AllMandatoryRequirementsApproved
RegularClassCompleted
ReviewerBelongsToSameClub
ReviewerCanAssessStudent
```

Ejemplo:

```ts
const canRequestInvestiture =
  new AllMandatoryRequirementsApproved()
    .and(new DirectorAssessmentCompleted());
```

Esto permite evitar condicionales gigantes.

## 7.7. Adapter

Aísla proveedores externos:

```text
SupabaseAuthAdapter
SupabaseStorageAdapter
EmailProviderAdapter
PdfExportAdapter
```

Si se cambia el almacenamiento, no debería ser necesario modificar la lógica de entregas.

## 7.8. Observer o Domain Events

Después de una acción importante, otros módulos pueden reaccionar:

```text
SubmissionApproved
├── actualizar progreso
├── crear notificación
├── registrar auditoría
└── comprobar si la clase está completa
```

Dentro del monolito se puede comenzar con eventos internos síncronos. No se necesita Kafka, RabbitMQ ni un bus distribuido.

## 7.9. Policy

Representa reglas de autorización:

```text
SubmissionAccessPolicy
ClassManagementPolicy
ManualApprovalPolicy
EvidenceDownloadPolicy
InvestitureApprovalPolicy
```

No basta con ocultar botones en el frontend. La autorización debe verificarse en el servidor y en PostgreSQL mediante RLS.

## 7.10. DTO y Mapper

Evita exponer directamente las filas de la base de datos:

```text
SubmissionRow
→ SubmissionMapper
→ Submission
→ SubmissionResponseDTO
```

Esto permite impedir que las vistas del conquistador reciban comentarios internos o datos administrativos.

## 7.11. Patrones complementarios

- **Unit of Work:** solo si se necesitan transacciones complejas.
- **Builder:** para definir formularios o requisitos complejos.
- **Template Method:** si varias evaluaciones comparten el mismo flujo.
- **Result Pattern:** para representar errores de negocio controlados.

## 7.12. Patrones que no se utilizarán inicialmente

### CQRS completo

Separar formalmente las lecturas y escrituras agregaría complejidad innecesaria. Es posible diferenciar consultas y comandos en el código sin mantener dos modelos físicos.

### Event Sourcing

No es necesario reconstruir todo el estado desde eventos. Una tabla de auditoría cubre el requisito actual.

### Microservicios

No están justificados en esta etapa.

### Backend independiente adicional

No se utilizará NestJS, Spring Boot o FastAPI junto a Next.js en la primera etapa.

### Redux global

La mayor parte del estado provendrá del servidor. Se utilizará estado local, formularios y caché de consultas solo donde sea necesario.

---

# 8. Modelo de dominio

## 8.1. Entidades principales

```text
Club
Unit
User
Membership
ClassDefinition
ClassVersion
ClassSection
Requirement
RequirementOption
RequirementActivity
Enrollment
RequirementProgress
Submission
SubmissionAttempt
Review
Assessment
InvestitureAuthorization
Assignment
Notification
AuditEntry
```

## 8.2. Agregados recomendados

### ClassDefinition

Controla:

- versiones;
- secciones;
- requisitos;
- publicación.

### Enrollment

Controla:

- tarjeta asignada;
- progreso;
- estado;
- evaluación final.

### Submission

Controla:

- intentos;
- evidencias;
- revisión;
- transiciones.

### Club

Controla:

- membresías;
- unidades;
- roles locales.

---

# 9. Modelado de requisitos complejos

## 9.1. Requisito automático

Ejemplo:

> Tener como mínimo 10 años.

```text
completion_mode: SYSTEM_VALIDATED
evidence_required: false
validation_rule: AGE_AT_LEAST_10
```

Puede marcarse automáticamente según la fecha de nacimiento, aunque un administrador debe poder corregir datos erróneos.

## 9.2. Requisito administrativo

Ejemplo:

> Ser miembro activo del club.

```text
completion_mode: ADMIN_VALIDATED
source: CLUB_MEMBERSHIP
```

No se debería pedir al niño que adjunte una fotografía del uniforme.

## 9.3. Memorización y explicación

Ejemplo:

> Memorizar y explicar el Voto y la Ley.

Opciones:

```text
AUDIO
VIDEO
IN_PERSON_VALIDATION
```

Criterios:

- recita correctamente;
- demuestra comprensión;
- explica con sus palabras.

## 9.4. Lectura

Ejemplo:

> Leer el libro del Club de Lectura Juvenil.

Posibles actividades:

- registro de progreso;
- preguntas;
- conversación;
- reflexión final;
- validación presencial.

No conviene permitir que se complete marcando una casilla sin evaluación.

## 9.5. Requisito con lista interna

Ejemplo:

> Completar la lectura bíblica asignada.

Cada lectura se modelará como subrequisito:

```text
Lectura bíblica
├── Génesis 1
├── Génesis 2
├── Génesis 3
└── ...
```

El requisito padre se completa cuando se aprueban todos los ítems obligatorios.

## 9.6. Requisito con selección

Ejemplo:

> Completar una de las especialidades: Natación I, Aptitud física, Nudos y amarras o Seguridad básica en el agua.

```yaml
group_rule: AT_LEAST_ONE
options:
  - Natación I
  - Aptitud física
  - Nudos y amarras
  - Seguridad básica en el agua
```

## 9.7. Actividad presencial

Ejemplo:

> Acompañar el proceso de planificación y ejecución de una caminata de 5 km.

Evidencia válida:

- registro presencial;
- lista de cotejo;
- actividad grupal vinculada;
- observación del instructor.

El conquistador puede subir una reflexión, pero esta no debería bastar para aprobar la caminata.

## 9.8. Requisito práctico con múltiples habilidades

Ejemplo:

> Cuidar correctamente una cuerda y demostrar una lista de nudos.

Cada nudo puede ser un criterio o subrequisito:

```text
Cuidado de cuerda
Nudo simple
Nudo falso
Nudo llano
Nudo cirujano
As de guía
...
```

El requisito queda aprobado al cumplir la condición configurada, probablemente la totalidad de los criterios.

## 9.9. Especialidad externa

Ejemplo:

> Completar Arte de Acampar I.

El sistema debe permitir:

- enlazar una especialidad interna futura;
- seleccionar una especialidad completada;
- registrar la fecha;
- adjuntar un certificado;
- validarla presencialmente.

Inicialmente será suficiente un registro manual validado por un instructor.

---

# 10. Esquema de base de datos

```text
organizations
clubs
club_periods
units

profiles
memberships
role_assignments
guardian_links

class_definitions
class_versions
class_levels
class_sections
requirements
requirement_options
requirement_dependencies
requirement_criteria
requirement_resources

enrollments
requirement_progress
requirement_progress_items

submissions
submission_attempts
submission_answers
submission_files

reviews
review_criteria_results
manual_completions

class_assessments
investiture_authorizations

assignments
assignment_targets

notifications
audit_logs
```

## 10.1. Campos importantes de `requirements`

```text
id
class_version_id
section_id
parent_requirement_id
code
title
official_text
adapted_instructions
requirement_type
completion_rule
minimum_options_required
requires_submission
requires_review
allows_manual_completion
requires_in_person_validation
is_mandatory
display_order
status
```

## 10.2. Reglas de completitud

```text
ALL_CHILDREN
AT_LEAST_ONE
AT_LEAST_N
SINGLE_APPROVAL
EXTERNAL_REFERENCE
AUTOMATIC_RULE
```

---

# 11. Cálculo y presentación del progreso

Internamente se recomienda representar cuatro dimensiones:

```text
Avance trabajado
Avance enviado
Avance aprobado
Avance validado para investidura
```

En la pantalla principal pueden simplificarse:

- **Entregado:** incluye requisitos enviados.
- **Aprobado:** incluye requisitos validados.
- **Clase lista:** aparece cuando se cumplen las condiciones finales.

## 11.1. Cálculo ponderado

Inicialmente, cada requisito obligatorio principal puede valer lo mismo.

Un requisito padre con 40 capítulos no debería valer cuarenta veces más que otro requisito, salvo que exista una decisión pedagógica explícita.

Recomendación:

- el progreso general se calcula sobre requisitos principales;
- los subrequisitos calculan el avance interno del requisito padre;
- el requisito padre cuenta como aprobado únicamente cuando cumple su regla.

Ejemplo:

```text
Lectura bíblica: 20/54 ítems
Progreso interno: 37 %
Valor en la clase: aún no aprobado
```

El porcentaje de trabajo puede considerar avance parcial, pero el porcentaje aprobado no.

---

# 12. Panel administrativo

El panel debe tener cuatro vistas principales.

## 12.1. Bandeja de revisiones

Filtros por:

- clase;
- unidad;
- instructor;
- estado;
- fecha;
- conquistador;
- sección.

Cada tarjeta muestra:

- nombre del conquistador;
- requisito;
- fecha de entrega;
- tipo de evidencia;
- número de intento;
- tiempo esperando revisión.

## 12.2. Seguimiento por persona

La ficha del conquistador muestra:

- clase activa;
- progreso entregado;
- progreso aprobado;
- requisitos pendientes;
- requisitos presenciales;
- entregas rechazadas;
- actividad reciente;
- historial de comentarios.

## 12.3. Seguimiento por unidad

Permite detectar:

- quién está atrasado;
- quién no ha iniciado;
- qué requisitos dificultan más el avance;
- qué entregas llevan demasiado tiempo sin revisar.

## 12.4. Gestión de tarjetas

Editor para:

- crear secciones;
- agregar requisitos;
- ordenar contenido;
- configurar tipos de evidencia;
- definir criterios;
- publicar una versión.

Para el MVP, este editor puede ser simple. La tarjeta Amigo puede cargarse inicialmente mediante un archivo JSON o una migración SQL y el editor puede construirse posteriormente.

---

# 13. Estadísticas útiles

## 13.1. Para conquistadores

- progreso aprobado;
- progreso por sección;
- requisitos completados durante el mes;
- racha de semanas con actividad, de manera opcional.

## 13.2. Para instructores

- entregas pendientes;
- tiempo promedio de revisión;
- avance promedio de la unidad;
- requisitos con mayor cantidad de rechazos;
- personas sin actividad reciente.

## 13.3. Para la dirección

- avance general por clase;
- distribución por unidad;
- clases más activas;
- requisitos con mayor dificultad;
- cantidad de revisiones por instructor.

Se deben evitar rankings públicos entre niños. Pueden motivar a algunos, pero también convertir una experiencia formativa en una competencia desigual. Es preferible medir el progreso personal y las metas de unidad.

---

# 14. Seguridad y permisos

Este punto es obligatorio porque el sistema trabajará con menores y evidencias potencialmente sensibles.

## 14.1. Políticas mínimas

### Conquistador

- solo puede leer su perfil, inscripciones y progreso;
- solo puede crear entregas propias;
- puede leer sus revisiones visibles;
- no puede aprobar requisitos;
- no puede consultar entregas ajenas.

### Instructor

- puede leer a los miembros asignados;
- solo puede revisar usuarios de sus unidades o asignaciones;
- puede ver las evidencias necesarias para la evaluación;
- puede aprobar de acuerdo con sus permisos;
- no puede modificar roles directivos o administrativos.

### Director

- puede consultar todo el club;
- puede administrar asignaciones y clases;
- puede revisar todo el progreso;
- puede reasignar instructores;
- puede registrar avances manuales y evaluaciones.

### Administrador técnico

- puede administrar la configuración del sistema;
- no debería acceder automáticamente a evidencias sensibles;
- no necesariamente debería revisar evidencias personales.

Tener acceso técnico no debe implicar acceso pedagógico ilimitado.

Supabase recomienda proteger las tablas expuestas mediante RLS y conceder únicamente los privilegios necesarios.

## 14.2. Acciones que no deben ejecutarse desde el navegador

- aprobar requisitos;
- modificar roles;
- marcar completitud manual;
- autorizar una investidura;
- consultar archivos privados de otros usuarios;
- utilizar la clave `service_role`.

Estas acciones deben pasar por el servidor.

## 14.3. Protección de evidencias

Inicialmente no se permitirá:

- ubicación GPS;
- archivos públicos;
- comentarios entre menores;
- mensajería privada entre conquistadores;
- publicación de perfiles;
- descarga masiva de fotografías;
- videos sin límites.

Política recomendada:

- buckets privados;
- URLs temporales;
- límites de tamaño;
- validación del tipo MIME;
- antivirus o revisión posterior si aumenta el uso;
- acceso según rol;
- eliminación programada;
- no guardar ubicación;
- no mostrar perfiles públicamente;
- no permitir mensajería privada entre menores;
- no permitir comentarios públicos.

Límites iniciales sugeridos:

- imágenes: 5 a 10 MB;
- documentos: 10 MB;
- audio: 20 MB;
- video: evitarlo en el MVP o limitarlo estrictamente.

Para los videos se puede considerar:

- enlaces externos autorizados;
- archivos pequeños;
- aprobación presencial como alternativa preferente.

También se debe definir:

- eliminación automática de evidencias después de un periodo;
- consentimiento del apoderado cuando corresponda;
- política clara sobre quién puede acceder a los archivos.

Chile cuenta con la Ley 21.719, que modifica el régimen de tratamiento de datos personales. La plataforma debe diseñarse desde el comienzo aplicando finalidad definida, minimización, seguridad y eliminación de los datos que ya no sean necesarios.

Referencia: [Ley 21.719 en la Biblioteca del Congreso Nacional de Chile](https://www.bcn.cl/leychile/Navegar?idNorma=1209272)

No es necesario solicitar el RUT para una plataforma interna de este tipo. Sería una recopilación innecesaria que aumentaría el riesgo.

---

# 15. Estructura técnica del repositorio

```text
src/
├── app/
│   ├── (auth)/
│   ├── (pathfinder)/
│   ├── (instructor)/
│   ├── (director)/
│   └── api/
│
├── modules/
│   ├── identity/
│   ├── clubs/
│   ├── classes/
│   ├── enrollments/
│   ├── requirements/
│   ├── submissions/
│   ├── assessments/
│   ├── assignments/
│   ├── notifications/
│   └── audit/
│
├── shared/
│   ├── domain/
│   ├── infrastructure/
│   ├── validation/
│   ├── errors/
│   └── ui/
│
└── infrastructure/
    ├── supabase/
    ├── storage/
    ├── email/
    └── logging/
```

Estructura interna de un módulo:

```text
submissions/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── policies/
│   └── events/
├── application/
│   ├── commands/
│   ├── queries/
│   └── ports/
├── infrastructure/
│   ├── repositories/
│   └── mappers/
└── presentation/
    ├── actions/
    ├── schemas/
    └── components/
```

---

# 16. MVP y evolución del producto

## 16.1. Versión 1

- autenticación;
- perfiles;
- roles;
- una sola organización;
- unidades;
- tarjeta Amigo;
- inscripción en la tarjeta;
- visualización por secciones;
- envío de respuestas;
- carga de imágenes y PDF;
- revisión administrativa;
- solicitud de corrección;
- aprobación presencial;
- porcentajes entregado y aprobado;
- historial básico;
- auditoría administrativa.

## 16.2. Versión 1.5

- asignación de tareas;
- notificaciones internas;
- comentarios;
- criterios de evaluación;
- panel por unidad;
- exportación del avance a PDF o Excel.

## 16.3. Versión 2

- tarjeta Amigo de la Naturaleza;
- editor de tarjetas;
- múltiples clases simultáneas;
- apoderados;
- correos;
- estadísticas;
- insignias o logros;
- PWA instalable.

## 16.4. Versión 3

- múltiples clubes;
- administración por asociación;
- especialidades;
- actividades grupales;
- validaciones mediante código QR;
- aplicación móvil, solo si la web demuestra suficiente uso.

---

# 17. Plantilla para digitalizar requisitos

Al revisar la tarjeta Amigo, cada requisito debe convertirse en una ficha que responda:

1. ¿Cuál es el texto oficial?
2. ¿Es individual o grupal?
3. ¿Puede realizarse autónomamente?
4. ¿Requiere presencia del instructor?
5. ¿Qué actividad digital puede ayudar a cumplirlo?
6. ¿Qué evidencia es válida?
7. ¿Quién puede aprobarlo?
8. ¿Tiene subrequisitos?
9. ¿Depende de otro requisito?
10. ¿Cuáles son los criterios mínimos de aprobación?
11. ¿La evidencia debe conservarse después de la aprobación?
12. ¿Puede aprobarse manualmente sin archivo?

El resultado debe seguir una estructura similar a esta:

```text
Código: AMI-ESP-01
Sección: Descubrimiento espiritual
Requisito oficial: [...]
Modalidad: Mixta
Actividad digital: [...]
Evidencia: Texto, audio o validación presencial
Requiere revisión: Sí
Puede aprobarse presencialmente: Sí
Criterios:
- [...]
- [...]
- [...]
```

---

# 18. Nombre conceptual del sistema

Descripción técnica:

> **Sistema de Gestión de Progreso de Clases Regulares para Clubes de Conquistadores**

Posibles nombres visibles:

- Ruta Conquistador;
- Avanza;
- Mi Tarjeta;
- Senda;
- Progreso Conquistador;
- Ruta de Clases.

---

# 19. Decisiones finales de arquitectura

## Técnica arquitectónica

> **Descomposición modular por dominio, separación de responsabilidades, encapsulamiento de módulos e inversión de dependencias.**

## Estilo arquitectónico

> **Monolito modular desplegado sobre infraestructura serverless y servicios administrados.**

## Patrón arquitectónico

> **Arquitectura por capas con principios hexagonales: dominio, aplicación, infraestructura y presentación.**

## Patrones de diseño principales

- Repository.
- Application Service.
- State.
- Strategy.
- Factory.
- Specification.
- Adapter.
- Observer o Domain Events.
- Policy.
- DTO y Mapper.

## Stack final

```text
Frontend y backend web:
Next.js + TypeScript

Despliegue:
Vercel

Datos:
Supabase PostgreSQL

Autenticación:
Supabase Auth

Archivos:
Supabase Storage privado

Autorización:
RLS + políticas de aplicación

Arquitectura:
Monolito modular

Patrón interno:
Capas + orientación hexagonal

Comunicación interna:
Casos de uso + eventos de dominio

Primera tarjeta:
Amigo regular

Segunda fase:
Amigo de la Naturaleza
```

No se diseñará la primera versión pensando directamente en futuros microservicios, sino estableciendo **límites modulares claros**. Si algún día un módulo necesita separarse, esos límites facilitarán su extracción.

El principal desafío no será la infraestructura. Será **traducir correctamente cada requisito de la tarjeta a una actividad verificable**, sin convertir requisitos presenciales, espirituales o prácticos en simples formularios digitales.

La plataforma debe apoyar el trabajo del club, no reemplazar la interacción con los instructores.
