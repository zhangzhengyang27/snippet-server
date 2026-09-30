import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeSnippetsController } from './knowledge-snippets.controller';
import { KnowledgeSnippetsService } from './knowledge-snippets.service';
import { SnippetVersionService } from './snippet-version.service';
import { KnowledgeSnippet } from '../entities/knowledge-snippet.entity';
import { SnippetCollection } from '../entities/snippet-collection.entity';
import { KnowledgeSnippetTag } from '../entities/knowledge-snippet-tag.entity';
import { KnowledgeSnippetTagLink } from '../entities/knowledge-snippet-tag-link.entity';
import { SnippetVersion } from '../entities/snippet-version.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeSnippet,
      SnippetCollection,
      KnowledgeSnippetTag,
      KnowledgeSnippetTagLink,
      SnippetVersion,
    ]),
  ],
  controllers: [KnowledgeSnippetsController],
  providers: [KnowledgeSnippetsService, SnippetVersionService],
})
export class KnowledgeSnippetsModule {}
