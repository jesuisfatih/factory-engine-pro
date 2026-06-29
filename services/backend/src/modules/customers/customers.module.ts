import { Module } from '@nestjs/common';
import { ShopifyClientService } from '../sync/shopify-client.service.js';
import { CustomersController } from './customers.controller.js';
import { CustomersRepository } from './customers.repository.js';
import { CustomersService } from './customers.service.js';

@Module({
  controllers: [CustomersController],
  providers: [CustomersRepository, CustomersService, ShopifyClientService],
  exports: [CustomersRepository, CustomersService],
})
export class CustomersModule {}
