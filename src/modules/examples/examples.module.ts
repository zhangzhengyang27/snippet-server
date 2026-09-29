import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamplesController } from './examples.controller';
import { ExamplesService } from './examples.service';
import { Example } from './entities/example.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Example])],
  controllers: [ExamplesController],
  providers: [ExamplesService],
})
export class ExamplesModule {}
