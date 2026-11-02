import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
// Os quadros vão para o vídeo em JPEG: com a qualidade padrão (80) o texto fino e as bordas ficam sujos; 95 deixa nítido.
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
