import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module.js';
import { B2BAccessModule } from '../b2b-access/b2b-access.module.js';
import { MailModule } from '../mail/mail.module.js';
import { StorefrontModule } from '../storefront/storefront.module.js';
import { SupportModule } from '../support/support.module.js';
import { StorefrontFormsPublicController } from './storefront-forms.public.controller.js';
import { StorefrontFormsService } from './storefront-forms.service.js';

@Module({
  imports: [SharedModule, StorefrontModule, SupportModule, B2BAccessModule, MailModule],
  controllers: [StorefrontFormsPublicController],
  providers: [StorefrontFormsService],
})
export class StorefrontFormsModule {}
