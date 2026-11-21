import { Document, Types } from 'mongoose';

export interface IOCRImageMetadata {
  id: string;
  topLeftX: number;
  topLeftY: number;
  bottomRightX: number;
  bottomRightY: number;
  imageBase64: string;
  imageAnnotation?: string | null;
  reusable?: boolean | null;
}

export interface IOCRPageDimensions {
  dpi: number;
  height: number;
  width: number;
}

export interface IOCRPageMetadata {
  index: number;
  dimensions: IOCRPageDimensions;
  images: IOCRImageMetadata[];
}

export interface IOCRFileMetadata {
  provider: string;
  pages: IOCRPageMetadata[];
}

export interface IOriginalUploadMetadata {
  bytes: number;
  fileId?: string | null;
  filename: string;
  filepath: string;
  source: string;
  type: string;
}

export interface IFileMetadata {
  fileIdentifier?: string;
  ocr?: IOCRFileMetadata;
  originalUpload?: IOriginalUploadMetadata;
  [key: string]: unknown;
}

export interface IMongoFile extends Omit<Document, 'model'> {
  user: Types.ObjectId;
  projectId?: string;
  conversationId?: string;
  messageId?: string;
  file_id: string;
  temp_file_id?: string;
  bytes: number;
  text?: string;
  filename: string;
  filepath: string;
  object: 'file';
  embedded?: boolean;
  type: string;
  context?: string;
  usage: number;
  source: string;
  model?: string;
  width?: number;
  height?: number;
  metadata?: IFileMetadata;
  expiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}
