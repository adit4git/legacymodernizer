using ContosoStore.Api.Data;
using ContosoStore.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ContosoStore.Api.Services;

public interface IProductService
{
    Task<IEnumerable<Product>> ListAsync(string? category, int page, int size);
    Task<Product?> GetAsync(int id);
    Task<Product> CreateAsync(Product p);
    Task<Product?> UpdateAsync(int id, Product p);
    Task<bool> DeleteAsync(int id);
}

public class ProductService : IProductService
{
    private readonly StoreDbContext _db;
    public ProductService(StoreDbContext db) => _db = db;

    public async Task<IEnumerable<Product>> ListAsync(string? category, int page, int size)
    {
        var q = _db.Products.AsQueryable().Where(p => p.IsActive);
        if (!string.IsNullOrWhiteSpace(category))
            q = q.Where(p => p.Category == category);
        return await q.OrderByDescending(p => p.CreatedAt)
                      .Skip((page - 1) * size).Take(size).ToListAsync();
    }

    public Task<Product?> GetAsync(int id) =>
        _db.Products.FirstOrDefaultAsync(p => p.Id == id && p.IsActive);

    public async Task<Product> CreateAsync(Product p)
    {
        p.CreatedAt = DateTime.UtcNow;
        _db.Products.Add(p);
        await _db.SaveChangesAsync();
        return p;
    }

    public async Task<Product?> UpdateAsync(int id, Product p)
    {
        var existing = await _db.Products.FindAsync(id);
        if (existing is null) return null;
        existing.Name = p.Name;
        existing.Description = p.Description;
        existing.Price = p.Price;
        existing.StockQuantity = p.StockQuantity;
        existing.Category = p.Category;
        existing.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var existing = await _db.Products.FindAsync(id);
        if (existing is null) return false;
        existing.IsActive = false;
        existing.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return true;
    }
}
