import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamClient } from '@stream-io/node-sdk';

@Injectable()
export class StreamService {
  private readonly streamClient: StreamClient | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('STREAM_API_KEY');
    const apiSecret = this.config.get<string>('STREAM_API_SECRET');
    if (apiKey && apiSecret) {
      this.streamClient = new StreamClient(apiKey, apiSecret, {
        timeout: 15000, // 15 secondes au lieu de 3 secondes par défaut
      });
    }
  }

  /**
   * Generate a Stream user token for Chat and Video.
   * Token can be used by the client to connect to Stream.
   * iat (issued at) est mis à 60 s dans le passé pour absorber le décalage d'horloge
   * (évite AuthErrorTokenUsedBeforeIssuedAt si le serveur est en avance sur Stream).
   */
  createUserToken(userId: string): string {
    if (!this.streamClient) {
      throw new BadRequestException(
        'Stream is not configured. Set STREAM_API_KEY and STREAM_API_SECRET in .env',
      );
    }
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new BadRequestException('userId is required');
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const iat = nowSec - 60; // 60 s dans le passé pour tolérance clock skew
    const exp = nowSec + 60 * 60; // expiration 1 h
    return this.streamClient.createToken(userId.trim(), exp, iat);
  }

  getApiKey(): string | undefined {
    return this.config.get<string>('STREAM_API_KEY');
  }

  /**
   * Garantit que l'utilisateur est membre du canal arena-live (côté serveur).
   * À appeler avant d'utiliser le chat Arena pour que l'envoi de messages fonctionne.
   */
  async ensureArenaMember(userId: string): Promise<void> {
    if (!this.streamClient) {
      throw new BadRequestException(
        'Stream is not configured. Set STREAM_API_KEY and STREAM_API_SECRET in .env',
      );
    }
    if (!userId?.trim()) {
      throw new BadRequestException('userId is required');
    }
    const uid = userId.trim();
    const channel = this.streamClient.chat.channel('messaging', 'arena-live');
    await channel.getOrCreate({
      data: {
        members: [{ user_id: uid }],
        created_by: { id: uid },
      },
    });
    await channel.update({ add_members: [{ user_id: uid }] }).catch(() => {
      // Déjà membre ou erreur non bloquante
    });
  }

  /**
   * Garantit que l'utilisateur est membre d'un canal (room) donné.
   * Utilisé pour les salles hackathon : chat + visio + partage d'écran par room.
   */
  async ensureRoomMember(userId: string, roomId: string): Promise<void> {
    if (!this.streamClient) {
      throw new BadRequestException(
        'Stream is not configured. Set STREAM_API_KEY and STREAM_API_SECRET in .env',
      );
    }
    if (!userId?.trim()) {
      throw new BadRequestException('userId is required');
    }
    const safeRoomId =
      String(roomId)
        .trim()
        .replace(/[^a-z0-9-_]/gi, '') || 'default-room';
    const uid = userId.trim();
    const channel = this.streamClient.chat.channel('messaging', safeRoomId);
    await channel.getOrCreate({
      data: {
        members: [{ user_id: uid }],
        created_by: { id: uid },
      },
    });
    await channel.update({ add_members: [{ user_id: uid }] }).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────
  // TEAM CHAT — Private channel per equipe per competition
  // ─────────────────────────────────────────────────────────────────

  /**
   * Génère l'identifiant unique du canal pour une équipe dans un hackathon.
   */
  private teamChannelId(equipeId: string, competitionId: string): string {
    const safeEquipe = equipeId.trim().replace(/[^a-z0-9-_]/gi, '');
    const safeComp = competitionId.trim().replace(/[^a-z0-9-_]/gi, '');
    return `team-${safeEquipe}-comp-${safeComp}`;
  }

  /**
   * Crée un canal de chat privé pour une équipe dans un hackathon.
   * Seuls les membres listés peuvent lire/écrire.
   */
  async createTeamChannel(
    equipeId: string,
    competitionId: string,
    equipeName: string,
    memberIds: string[],
  ): Promise<void> {
    if (!this.streamClient) {
      // Stream non configuré → on ne bloque pas l'opération
      return;
    }
    const channelId = this.teamChannelId(equipeId, competitionId);
    const members = memberIds.map((id) => ({ user_id: id.trim() }));
    const creatorId = memberIds[0]?.trim();
    if (!creatorId) return;

    const channel = this.streamClient.chat.channel('messaging', channelId);
    await channel.getOrCreate({
      data: {
        members,
        created_by: { id: creatorId },
      } as any,
    });
    // Ensure all members are added + set name
    await channel
      .update({ add_members: members } as any)
      .catch(() => {});
  }

  /**
   * Ajoute un utilisateur au canal de chat de son équipe.
   * Appelé quand un membre accepte une invitation.
   */
  async ensureTeamMember(
    equipeId: string,
    competitionId: string,
    userId: string,
  ): Promise<void> {
    if (!this.streamClient) return;
    if (!userId?.trim()) return;

    const channelId = this.teamChannelId(equipeId, competitionId);
    const uid = userId.trim();
    const channel = this.streamClient.chat.channel('messaging', channelId);
    await channel.getOrCreate({
      data: {
        members: [{ user_id: uid }],
        created_by: { id: uid },
      },
    });
    await channel
      .update({ add_members: [{ user_id: uid }] })
      .catch(() => {});
  }

  /**
   * Archive (freeze) tous les canaux de chat des équipes d'une compétition.
   * Plus aucun message ne peut être envoyé, mais l'historique reste lisible.
   */
  async archiveTeamChannels(
    competitionId: string,
    equipeIds: string[],
  ): Promise<void> {
    if (!this.streamClient) return;

    for (const equipeId of equipeIds) {
      try {
        const channelId = this.teamChannelId(equipeId, competitionId);
        const channel = this.streamClient.chat.channel('messaging', channelId);
        await channel.update({
          set: {
            frozen: true,
            name: undefined as any, // keep existing name
          },
        } as any);
      } catch {
        // Canal inexistant ou erreur non bloquante
      }
    }
  }
}
