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
                'Accept': 'application/json, text/plain, */*',
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://brandcollectionfabricasp.vendizap.com',
                'Referer': 'https://brandcollectionfabricasp.vendizap.com/'
            },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            return NextResponse.json({ error: `Erro HTTP Fornecedor: ${res.status}` }, { status: 502 });
        }

        const data = await res.json();
        const galeria = data.listas?.listaGaleria || [];
        allProducts.push(...galeria);
        
        if (galeria.length === 0) {
            console.log(`Página ${page} veio vazia. Resposta:`, JSON.stringify(data).substring(0, 100));
            break;
        }
        page++;
        if (page > 10) break;
    }
    
    if (allProducts.length === 0) {
        return NextResponse.json({ 
            success: false, 
            message: "O fornecedor não enviou nenhum produto. Isso pode ser um bloqueio temporário do IP do Vercel." 
        });
    }

    // 2. Filter Target Categories (DESATIVADO PARA TRAZER TUDO)
    const filtered = allProducts; 
    let syncedCount = 0;
    
    for (const prod of filtered) {
        try {
            const externalId = String(prod._id?.$oid || prod._id);
            if (!externalId) continue;

            const nome = prod.nome || 'Produto Sem Nome';
            const catName = prod.categorias?.[0]?.nome || 'Importados';
            const imagem_url = prod.imagemUrl || '';
            const preco_custo = Number(prod.variacoes?.[0]?.preco || prod.preco || 0);
            const estoque = Number(prod.variacoes?.[0]?.estoque || prod.estoque || 0);
            const disponivel = estoque > 0 && !prod.esgotado;

            await prisma.product.upsert({
                where: { external_id: externalId },
                update: { 
                    nome, 
                    categoria: catName, 
                    imagem_url, 
                    preco_custo: isNaN(preco_custo) ? 0 : preco_custo, 
                    estoque: isNaN(estoque) ? 0 : estoque, 
                    disponivel, 
                    updated_at: new Date() 
                },
                create: {
                    external_id: externalId,
                    nome,
                    categoria: catName,
                    imagem_url,
                    preco_custo: isNaN(preco_custo) ? 0 : preco_custo,
                    preco_venda: 0,
                    estoque: isNaN(estoque) ? 0 : estoque,
                    disponivel,
                    publicar_no_site: false,
                    classificacao: 'Unissex'
                }
            });
            syncedCount++;
        } catch (err: any) {
            console.error(`Erro no produto ${prod.nome}:`, err.message);
        }
    }
    
    return NextResponse.json({ 
        success: true, 
        message: `SUCESSO! Foram sincronizados ${syncedCount} produtos para o seu painel.` 
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro Interno', details: error.message }, { status: 500 });
  }
}
