import { SetMetadata } from '@nestjs/common';

export const TRANSFORMHUB_PUBLIC_KEY = 'transformhub_public';
export const PublicTransformHub = () => SetMetadata(TRANSFORMHUB_PUBLIC_KEY, true);
