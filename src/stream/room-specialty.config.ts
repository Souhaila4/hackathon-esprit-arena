import { Specialty } from '@prisma/client';

/** Toutes les spécialités (enum Prisma). Une salle par spécialité, créée à la demande. */
export const ALL_SPECIALTIES: Specialty[] = Object.values(
  Specialty,
) as Specialty[];

/** Préfixe des IDs de salle : room-<SPECIALTY> (ex. room-FRONTEND). La salle est créée côté Stream au premier join. */
export const ROOM_ID_PREFIX = 'room-';

/** Libellés pour l'affichage (nom + description) par spécialité */
export const SPECIALTY_LABELS: Record<
  Specialty,
  { name: string; description: string }
> = {
  FRONTEND: { name: 'Salle Frontend', description: 'Frontend & React' },
  BACKEND: { name: 'Salle Backend', description: 'Backend & API' },
  FULLSTACK: { name: 'Salle Full-stack', description: 'Full-stack' },
  MOBILE: { name: 'Salle Mobile', description: 'Développement mobile' },
  DATA: { name: 'Salle Data', description: 'Data & analytics' },
  BI: { name: 'Salle BI', description: 'Business Intelligence' },
  CYBERSECURITY: {
    name: 'Salle Cybersécurité',
    description: 'Sécurité & pentest',
  },
  DESIGN: { name: 'Salle Design', description: 'UI/UX & design' },
  DEVOPS: { name: 'Salle DevOps', description: 'DevOps & infra' },
};

export interface RoomInfo {
  id: string;
  name: string;
  description: string;
}

/**
 * Génère l'ID de salle pour une spécialité.
 * Une salle par spécialité ; côté Stream elle sera créée au premier getOrCreate.
 */
export function getRoomIdForSpecialty(specialty: Specialty): string {
  return `${ROOM_ID_PREFIX}${specialty}`;
}

/**
 * Extrait la spécialité à partir d'un roomId (ex. room-FRONTEND -> FRONTEND).
 * Retourne null si le format est invalide ou si la spécialité n'existe pas.
 */
export function getSpecialtyFromRoomId(roomId: string): Specialty | null {
  const safe = String(roomId)
    .trim()
    .replace(/[^a-z0-9-_]/gi, '');
  if (!safe.startsWith(ROOM_ID_PREFIX)) return null;
  const specialty = safe
    .slice(ROOM_ID_PREFIX.length)
    .toUpperCase() as Specialty;
  return ALL_SPECIALTIES.includes(specialty) ? specialty : null;
}

/**
 * Vérifie si l'utilisateur (avec mainSpecialty défini après analyse du CV) peut accéder à la salle.
 * Accès autorisé uniquement si la salle correspond à sa spécialité.
 */
export function canAccessRoom(
  roomId: string,
  mainSpecialty: Specialty | null,
): boolean {
  if (!mainSpecialty) return false;
  const required = getSpecialtyFromRoomId(roomId);
  return required === mainSpecialty;
}

export interface RoomWithAccess extends RoomInfo {
  specialty: Specialty;
  canParticipate: boolean;
}

/**
 * Retourne une salle virtuelle pour une spécialité (créée côté Stream au premier join).
 */
function getRoomInfoForSpecialty(
  specialty: Specialty,
): RoomInfo & { specialty: Specialty } {
  const labels = SPECIALTY_LABELS[specialty] ?? {
    name: `Salle ${specialty}`,
    description: `Spécialité ${specialty}`,
  };
  return {
    id: getRoomIdForSpecialty(specialty),
    name: labels.name,
    description: labels.description,
    specialty,
  };
}

/** Salles disponibles pour une spécialité (une seule : celle de l'utilisateur). */
export function getRoomsForSpecialty(
  mainSpecialty: Specialty | null,
): RoomInfo[] {
  if (!mainSpecialty) return [];
  return [getRoomInfoForSpecialty(mainSpecialty)];
}

/**
 * Liste toutes les salles (une par spécialité).
 * canParticipate = true uniquement pour la spécialité de l'utilisateur (celle détectée via le CV).
 */
export function getAllRoomsWithAccess(
  mainSpecialty: Specialty | null,
): RoomWithAccess[] {
  return ALL_SPECIALTIES.map((specialty) => {
    const room = getRoomInfoForSpecialty(specialty);
    return {
      ...room,
      canParticipate: mainSpecialty === specialty,
    };
  });
}
