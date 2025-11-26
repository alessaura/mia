import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do Banco Nova Era...');

  const customers = [
    {
      id: 'cust-ale',
      clientName: 'Alessandra Sanches',
      firstName: 'Alessandra',
      documentType: 'CPF' as const,
    },
    {
      id: 'cust-jose',
      clientName: 'José da Silva',
      firstName: 'José',
      documentType: 'CPF' as const,
    },
    {
      id: 'cust-empresa1',
      clientName: 'Empresa Primavera LTDA',
      firstName: 'Representante',
      documentType: 'CNPJ' as const,
    },
  ];

  for (const c of customers) {
    await prisma.customer.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        clientName: c.clientName,
        firstName: c.firstName,
        documentType: c.documentType,
      },
    });
  }

  console.log('👤 Customers criados com sucesso!');
}

main()
  .then(() => {
    console.log('🌱 Seed finalizado com sucesso!');
  })
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
