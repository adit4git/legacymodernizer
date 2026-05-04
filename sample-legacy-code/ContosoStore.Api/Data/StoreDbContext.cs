using ContosoStore.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ContosoStore.Api.Data;

public class StoreDbContext : DbContext
{
    public StoreDbContext(DbContextOptions<StoreDbContext> opt) : base(opt) { }

    public DbSet<Product> Products => Set<Product>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Product>().Property(p => p.Price).HasPrecision(10, 2);
        b.Entity<Order>().Property(o => o.TotalAmount).HasPrecision(10, 2);
        b.Entity<OrderItem>().Property(o => o.UnitPrice).HasPrecision(10, 2);
        b.Entity<Order>().HasMany(o => o.Items).WithOne().HasForeignKey(i => i.OrderId);
    }
}
