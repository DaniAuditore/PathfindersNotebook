export interface OwnProfileReadModel {
  displayName: string;
}

export interface ManagedStudentReadModel {
  id: string;
  clubId: string;
  displayName: string;
  birthYear: number | null;
}
