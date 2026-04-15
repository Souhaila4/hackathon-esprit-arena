import { Specialty } from '@prisma/client';

/** Toutes les spécialités (enum Prisma). Utilisé pour l’admin / stats — plus pour les salles membres. */
export const ALL_SPECIALTIES: Specialty[] = Object.values(
  Specialty,
) as Specialty[];

/** Préfixe historique des IDs : room-<SPECIALTY> (ex. room-FRONTEND). */
export const ROOM_ID_PREFIX = 'room-';

/**
 * Salle unique pour tous les membres (hors canaux d’équipe).
 * Stream channel id — pas une valeur de l’enum Specialty (getSpecialtyFromRoomId → null).
 */
export const GENERAL_MEMBER_ROOM_ID = `${ROOM_ID_PREFIX}general`;

const GENERAL_MEMBER_ROOM_LABEL = {
  name: 'Salle générale',
  description:
    'Espace commun : chat, visio et partage d’écran pour tous les membres.',
} as const;

/** Libellés pour l’affichage (nom + description) par spécialité — référence historique / admin */
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

function normalizeRoomId(roomId: string): string {
  return String(roomId)
    .trim()
    .replace(/[^a-z0-9-_]/gi, '');
}

/**
 * Génère l'ID de salle pour une spécialité (référence historique).
 */
export function getRoomIdForSpecialty(specialty: Specialty): string {
  return `${ROOM_ID_PREFIX}${specialty}`;
}

/**
 * Extrait la spécialité à partir d'un roomId (ex. room-FRONTEND -> FRONTEND).
 * Retourne null pour room-general ou format invalide.
 */
export function getSpecialtyFromRoomId(roomId: string): Specialty | null {
  const safe = normalizeRoomId(roomId);
  if (!safe.startsWith(ROOM_ID_PREFIX)) return null;
  if (safe === GENERAL_MEMBER_ROOM_ID) return null;
  const specialty = safe
    .slice(ROOM_ID_PREFIX.length)
    .toUpperCase() as Specialty;
  return ALL_SPECIALTIES.includes(specialty) ? specialty : null;
}

/**
 * Accès à la salle hackathon « membres » : uniquement la salle générale, pour tout utilisateur connecté.
 * Les anciennes salles room-FRONTEND, etc. ne sont plus ouvertes via ce flux (canaux d’équipe inchangés ailleurs).
 */
export function canAccessRoom(
  roomId: string,
  _mainSpecialty: Specialty | null,
): boolean {
  return normalizeRoomId(roomId) === GENERAL_MEMBER_ROOM_ID;
}

export interface RoomWithAccess extends RoomInfo {
  specialty?: Specialty | null;
  canParticipate: boolean;
}

/**
 * @deprecated Préférer getAllRoomsWithAccess. Conservé pour compatibilité : retourne la salle générale.
 */
export function getRoomsForSpecialty(
  _mainSpecialty: Specialty | null,
): RoomInfo[] {
  return [
    {
      id: GENERAL_MEMBER_ROOM_ID,
      name: GENERAL_MEMBER_ROOM_LABEL.name,
      description: GENERAL_MEMBER_ROOM_LABEL.description,
    },
  ];
}

/**
 * Liste la salle commune pour tous les membres (indépendamment de la spécialité).
 */
export function getAllRoomsWithAccess(
  _mainSpecialty: Specialty | null,
): RoomWithAccess[] {
  return [
    {
      id: GENERAL_MEMBER_ROOM_ID,
      name: GENERAL_MEMBER_ROOM_LABEL.name,
      description: GENERAL_MEMBER_ROOM_LABEL.description,
      specialty: null,
      canParticipate: true,
    },
  ];
}
