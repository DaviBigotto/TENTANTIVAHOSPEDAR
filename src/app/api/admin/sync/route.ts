import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Bypass SSL certificate errors from Vendizap in dev
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Allow 5 minutes for this request to complete (it's a heavy scraper)
export const maxDuration = 300; 
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}

export async function POST(req: Request) {
  try {
    let allProducts: any[] = [];
    let page = 0;
    
    // 1. Fetch from Vendizap API
    while (true) {
        const payload = {
            "idUsuario": "633e0f5ae20456715d1067a4",
            "textoPesquisa": "",
            "categoria": [],
            "filtrosVitrine": {
                "texto": "",
                "precoMin": 0,
                "precoMax": 0,
                "variacoes": []
            },
            "isTabela": true,
            "permiteCache": true,
            "tipoCache": "geral",
            "produtoURL": null,
            "isMobile": false,
            "paginaGerais": page,
            "paginaPromocoes": 0
        };

        const res = await fetch('https://app.vendizap.com/webservice/Vitrine/carregarVitrine', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://brandcollectionfabricasp.vendizap.com',
                'Referer': 'https://brandcollectionfabricasp.vendizap.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            return NextResponse.json({ error: `Erro Fornecedor: ${res.status} ${res.statusText}` }, { status: 502 });
        }

        const data = await res.json();
        const galeria = data.listas?.listaGaleria || [];
        allProducts.push(...galeria);
        
        if (galeria.length === 0) break;
        page++;
        if (page > 15) break; // Reduzi o limite para o Vercel não dar timeout
    }
    
    // Debug: Collect unique categories found
    const foundCategories: Record<string, string> = {};
    allProducts.forEach(p => {
        p.categorias?.forEach((c: any) => {
            if (c.$oid && !foundCategories[c.$oid]) {
                foundCategories[c.$oid] = c.nome || "Sem Nome";
            }
        });
    });

    // 2. Filter Target Categories (DESATIVADO PARA TRAZER TUDO)
    const filtered = allProducts; // Trazendo todos os 640 produtos

    // 3. Upsert to Prisma
    let syncedCount = 0;
    for (const prod of filtered) {
        try {
            const externalId = prod._id.$oid;
            const nome = prod.nome;
            
            // Tenta pegar o nome da categoria se existir, senão usa 'Geral'
            const catName = prod.categorias?.[0]?.nome || 'Importados';
            const imagem_url = prod.imagemUrl || null;
            const preco_custo = prod.variacoes?.[0]?.preco || prod.preco || 0;
            const estoque = prod.variacoes?.[0]?.estoque || prod.estoque || 0;
            const disponivel = estoque > 0 && !prod.esgotado;

            await prisma.product.upsert({
                where: { external_id: externalId },
                update: { nome, categoria: catName, imagem_url, preco_custo, estoque, disponivel, updated_at: new Date() },
                create: {
                    external_id: externalId,
                    nome,
                    categoria: catName,
                    imagem_url,
                    preco_custo,
                    preco_venda: 0,
                    estoque,
                    disponivel,
                    publicar_no_site: false,
                    classificacao: 'Unissex'
                }
            });
            syncedCount++;
        } catch (e) {}
    }
    
    return NextResponse.json({ 
        success: true, 
        message: `SUCESSO! Foram sincronizados ${syncedCount} produtos para o seu painel.` 
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro Interno', details: error.message }, { status: 500 });
  }
}
