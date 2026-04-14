import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AntiCheatController } from './anti-cheat.controller';
import axios from 'axios';

// ── Mock axios globalement ──────────────────────────────────────────────────
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// ── Helper : crée un faux fichier Multer ────────────────────────────────────
function makeFakeFile(
  fieldname: string,
  originalname: string,
  mimetype: string,
  content = 'fake-content',
): Express.Multer.File {
  return {
    fieldname,
    originalname,
    encoding: '7bit',
    mimetype,
    buffer: Buffer.from(content),
    size: content.length,
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
  };
}

// ────────────────────────────────────────────────────────────────────────────
describe('AntiCheatController', () => {
  let controller: AntiCheatController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AntiCheatController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'HUGGINGFACE_TOKEN') return 'hf_test_token';
              return undefined;
            },
          },
        },
      ],
    })
      // Désactiver JwtAuthGuard pour les tests unitaires
      .overrideGuard(require('../auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AntiCheatController>(AntiCheatController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  validateImage
  // ══════════════════════════════════════════════════════════════════════════

  describe('validateImage', () => {
    it('doit lancer BadRequestException si aucune image fournie', async () => {
      await expect(
        controller.validateImage({ image: undefined, avatar: undefined }),
      ).rejects.toThrow(BadRequestException);
    });

    it('doit lancer BadRequestException si le tableau image est vide', async () => {
      await expect(
        controller.validateImage({ image: [], avatar: undefined }),
      ).rejects.toThrow(BadRequestException);
    });

    it('doit appeler le HF Space image avec les bons headers et retourner le résultat', async () => {
      const fakeResult = { is_same_person: true, confidence: 0.97 };
      mockedAxios.post = jest.fn().mockResolvedValueOnce({ data: fakeResult });

      const imageFile = makeFakeFile('image', 'workspace.jpg', 'image/jpeg');
      const result = await controller.validateImage({ image: [imageFile] });

      // Vérifier que axios a bien été appelé
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const [url, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(url).toContain('antiimagesenvirement');
      expect(config.headers['Authorization']).toBe('Bearer hf_test_token');
      expect(result).toEqual(fakeResult);
    });

    it('doit inclure le fichier avatar dans le form si fourni', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValueOnce({ data: { ok: true } });

      const imageFile = makeFakeFile('image', 'ws.jpg', 'image/jpeg');
      const avatarFile = makeFakeFile('avatar', 'face.jpg', 'image/jpeg');
      await controller.validateImage({
        image: [imageFile],
        avatar: [avatarFile],
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      // Le form doit avoir été construit sans erreur (pas de throw = succès)
    });

    it('doit propager les erreurs axios', async () => {
      mockedAxios.post = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network Error'));

      const imageFile = makeFakeFile('image', 'ws.jpg', 'image/jpeg');
      await expect(
        controller.validateImage({ image: [imageFile] }),
      ).rejects.toThrow('Network Error');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  validateAudio
  // ══════════════════════════════════════════════════════════════════════════

  describe('validateAudio', () => {
    it('doit lancer BadRequestException si aucun fichier audio fourni', async () => {
      await expect(
        controller.validateAudio({ audio: undefined }),
      ).rejects.toThrow(BadRequestException);
    });

    it('doit lancer BadRequestException si le tableau audio est vide', async () => {
      await expect(controller.validateAudio({ audio: [] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('doit appeler le HF Space audio avec les bons headers et retourner le résultat', async () => {
      const fakeResult = { is_human: true, score: 0.88 };
      mockedAxios.post = jest.fn().mockResolvedValueOnce({ data: fakeResult });

      const audioFile = makeFakeFile('audio', 'voice.m4a', 'audio/m4a');
      const result = await controller.validateAudio({ audio: [audioFile] });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const [url, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(url).toContain('modelevocal');
      expect(config.headers['Authorization']).toBe('Bearer hf_test_token');
      expect(result).toEqual(fakeResult);
    });

    it('doit propager les erreurs axios', async () => {
      mockedAxios.post = jest
        .fn()
        .mockRejectedValueOnce(new Error('HF timeout'));

      const audioFile = makeFakeFile('audio', 'voice.m4a', 'audio/m4a');
      await expect(
        controller.validateAudio({ audio: [audioFile] }),
      ).rejects.toThrow('HF timeout');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  Sécurité — le token HF ne doit JAMAIS être vide en production
  // ══════════════════════════════════════════════════════════════════════════

  describe('Configuration sécurité', () => {
    it("le token HF doit être lu depuis ConfigService et non depuis l'env Flutter", async () => {
      // Le controller est instancié avec 'hf_test_token' dans le mock
      // Vérifier qu'il utilise bien le token du backend
      mockedAxios.post = jest.fn().mockResolvedValueOnce({ data: {} });

      const imageFile = makeFakeFile('image', 'ws.jpg', 'image/jpeg');
      await controller.validateImage({ image: [imageFile] });

      const [, , config] = (mockedAxios.post as jest.Mock).mock.calls[0];
      // Le token doit correspondre exactement à ce que ConfigService retourne
      expect(config.headers['Authorization']).toBe('Bearer hf_test_token');
      // Il ne doit pas être vide
      expect(config.headers['Authorization']).not.toBe('Bearer ');
    });
  });
});
