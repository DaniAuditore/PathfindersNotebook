import { PageHeader } from "@/shared/ui/page-header";
import { DeferredState } from "@/shared/ui/deferred-state";

export default function UnavailableOperationsPage() {
  return <><PageHeader title="Operaciones no disponibles" description="Estas funciones no están habilitadas en esta versión." />
    <div className="stack">
      <DeferredState title="Evidencia de archivos">La validación de evidencia se realiza de forma presencial hasta contar con un flujo aprobado de análisis y cuarentena. No hay carga ni descarga de archivos disponible.</DeferredState>
      <DeferredState title="Autorizaciones regionales y unidades">La gestión regional, de unidades y de consejeros aún no tiene un contrato de autorización seguro.</DeferredState>
      <DeferredState title="Notificaciones, exportaciones y recuperación">Las notificaciones, exportaciones y recuperación de cuenta no están disponibles. Consulte al responsable de su club.</DeferredState>
      <DeferredState title="Roles y vinculaciones">La asignación de roles, invitaciones y vinculación de cuentas se gestiona fuera de esta aplicación.</DeferredState>
    </div></>;
}
