import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Example } from './entities/example.entity';
import { generateId } from '../../common/utils/id.util';
import { clampPage, clampPageSize } from '../../common/utils/pagination.util';

export interface ExampleFilters {
  topicSlug?: string;
  categorySlug?: string;
  search?: string;
  isInteractive?: boolean;
  sourceFilePrefix?: string;
  sourceGroup?: string;
  ids?: string[];
}

@Injectable()
export class ExamplesService {
  constructor(
    @InjectRepository(Example)
    private exampleRepository: Repository<Example>,
  ) {}

  async findAll(filters: ExampleFilters, page: { page: number; limit: number }) {
    const pageNum = clampPage(page.page);
    const limit = clampPageSize(page.limit);

    const qb = this.exampleRepository
      .createQueryBuilder('example')
      .orderBy('example.createdAt', 'DESC');

    if (filters.topicSlug) {
      qb.andWhere('example.topicSlug = :topicSlug', { topicSlug: filters.topicSlug });
    }
    if (filters.categorySlug) {
      qb.andWhere('example.categorySlug = :categorySlug', { categorySlug: filters.categorySlug });
    }
    if (filters.isInteractive !== undefined) {
      qb.andWhere('example.isInteractive = :isInteractive', { isInteractive: filters.isInteractive });
    }
    if (filters.sourceFilePrefix) {
      qb.andWhere('example.sourceFile LIKE :prefix', { prefix: `${filters.sourceFilePrefix}%` });
    }
    if (filters.sourceGroup) {
      qb.andWhere('example.sourceGroup = :sourceGroup', { sourceGroup: filters.sourceGroup });
    }
    if (filters.ids?.length) {
      qb.andWhere('example.id IN (:...ids)', { ids: filters.ids });
    }
    if (filters.search) {
      qb.andWhere(
        '(example.title ILIKE :q OR example.description ILIKE :q OR example.tags::text ILIKE :q)',
        { q: `%${filters.search}%` },
      );
    }

    const total = await qb.getCount();
    const data = await qb
      .skip((pageNum - 1) * limit)
      .take(limit)
      .getMany();

    return {
      data,
      pagination: {
        page: pageNum,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string) {
    const example = await this.exampleRepository.findOne({ where: { id } });
    if (!example) {
      throw new NotFoundException(`示例 ${id} 不存在`);
    }
    return example;
  }

  async create(exampleData: Partial<Example>) {
    const example = this.exampleRepository.create({ ...exampleData, id: generateId() });
    return this.exampleRepository.save(example);
  }

  async update(id: string, exampleData: Partial<Example>) {
    const example = await this.findOne(id);
    Object.assign(example, exampleData);
    return this.exampleRepository.save(example);
  }

  async remove(id: string) {
    const example = await this.findOne(id);
    await this.exampleRepository.remove(example);
    return { ok: true };
  }
}
