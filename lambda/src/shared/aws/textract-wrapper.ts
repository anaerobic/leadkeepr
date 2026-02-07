/**
 * Standardized Textract operations wrapper with consistent error handling and metrics
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { TextractClient, DetectDocumentTextCommand, Block } from '@aws-sdk/client-textract';
import {
  AwsWrapperConfig,
  createAwsOperationExecutor,
  createAwsMetricsHelper,
} from './wrapper-base';

/**
 * Type definition for Textract wrapper interface
 */
export type TextractWrapper = ReturnType<typeof createTextractWrapper>;

/**
 * Textract operation result
 */
export interface TextractResult {
  text: string;
  blocks: Block[];
  lineCount: number;
  confidence?: number;
}

/**
 * Standardized Textract operations wrapper
 */
export function createTextractWrapper(client: TextractClient, config: AwsWrapperConfig) {
  const executeTextractOperation = createAwsOperationExecutor('Textract', config);
  const standardMetrics = createAwsMetricsHelper(config);

  return {
    async detectDocumentText(content: Buffer): Promise<TextractResult> {
      const result = await executeTextractOperation(
        async () => {
          const command = new DetectDocumentTextCommand({
            Document: {
              Bytes: content,
            },
          });

          const response = await client.send(command);

          if (!response.Blocks) {
            config.logger.warn('No blocks returned from Textract');
            return {
              text: '',
              blocks: [],
              lineCount: 0,
            };
          }

          // Extract text from LINE blocks
          const lineBlocks = response.Blocks.filter((block) => block.BlockType === 'LINE');
          const textLines = lineBlocks
            .map((block) => block.Text)
            .filter((text) => text && text.trim());

          const extractedText = textLines.join('\n');

          // Calculate average confidence if available
          const confidenceScores = lineBlocks
            .map((block) => block.Confidence)
            .filter((conf): conf is number => conf !== undefined);

          const averageConfidence =
            confidenceScores.length > 0
              ? confidenceScores.reduce((sum, conf) => sum + conf, 0) / confidenceScores.length
              : undefined;

          const textractResult: TextractResult = {
            text: extractedText,
            blocks: response.Blocks,
            lineCount: textLines.length,
            confidence: averageConfidence,
          };

          // Add metrics
          standardMetrics?.addSize('TextractDetectDocument', content.length);
          standardMetrics?.addCount('TextractLinesDetected', textLines.length);
          if (averageConfidence !== undefined) {
            standardMetrics?.addPercentage('TextractConfidence', averageConfidence);
          }

          return textractResult;
        },
        'DetectDocumentText',
        {
          contentSize: content.length,
          contentType: 'document',
        }
      );

      if (!result.success) {
        throw result.error;
      }
      return result.data!;
    },

    async detectImageText(content: Buffer): Promise<TextractResult> {
      const result = await executeTextractOperation(
        async () => {
          const command = new DetectDocumentTextCommand({
            Document: {
              Bytes: content,
            },
          });

          const response = await client.send(command);

          if (!response.Blocks) {
            config.logger.warn('No blocks returned from Textract for image');
            return {
              text: '',
              blocks: [],
              lineCount: 0,
            };
          }

          // Extract text from LINE blocks
          const lineBlocks = response.Blocks.filter((block) => block.BlockType === 'LINE');
          const textLines = lineBlocks
            .map((block) => block.Text)
            .filter((text) => text && text.trim());

          const extractedText = textLines.join('\n');

          // Calculate average confidence if available
          const confidenceScores = lineBlocks
            .map((block) => block.Confidence)
            .filter((conf): conf is number => conf !== undefined);

          const averageConfidence =
            confidenceScores.length > 0
              ? confidenceScores.reduce((sum, conf) => sum + conf, 0) / confidenceScores.length
              : undefined;

          const textractResult: TextractResult = {
            text: extractedText,
            blocks: response.Blocks,
            lineCount: textLines.length,
            confidence: averageConfidence,
          };

          // Add metrics
          standardMetrics?.addSize('TextractDetectImage', content.length);
          standardMetrics?.addCount('TextractLinesDetected', textLines.length);
          if (averageConfidence !== undefined) {
            standardMetrics?.addPercentage('TextractConfidence', averageConfidence);
          }

          return textractResult;
        },
        'DetectImageText',
        {
          contentSize: content.length,
          contentType: 'image',
        }
      );

      if (!result.success) {
        throw result.error;
      }
      return result.data!;
    },
  };
}
