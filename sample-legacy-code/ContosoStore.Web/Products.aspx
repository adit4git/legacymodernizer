<%@ Page Title="Products" Language="C#" MasterPageFile="~/Site.Master" AutoEventWireup="true"
    CodeBehind="Products.aspx.cs" Inherits="ContosoStore.Web.Products" %>

<asp:Content ID="cMain" ContentPlaceHolderID="MainContent" runat="server">
    <h1>Products</h1>

    <div class="filters">
        <asp:Label runat="server" Text="Category:" AssociatedControlID="ddlCategory" />
        <asp:DropDownList ID="ddlCategory" runat="server" AutoPostBack="true"
            OnSelectedIndexChanged="ddlCategory_Changed">
            <asp:ListItem Text="All" Value="" />
            <asp:ListItem Text="Books" Value="BOOKS" />
            <asp:ListItem Text="Electronics" Value="ELECTRONICS" />
            <asp:ListItem Text="Clothing" Value="CLOTHING" />
        </asp:DropDownList>
        <asp:TextBox ID="txtSearch" runat="server" placeholder="Search..." />
        <asp:Button ID="btnSearch" runat="server" Text="Search" OnClick="btnSearch_Click" />
    </div>

    <asp:GridView ID="gvProducts" runat="server" AutoGenerateColumns="false"
        AllowPaging="true" PageSize="20" OnPageIndexChanging="gvProducts_PageIndexChanging">
        <Columns>
            <asp:BoundField DataField="Id" HeaderText="ID" />
            <asp:BoundField DataField="Name" HeaderText="Name" />
            <asp:BoundField DataField="Category" HeaderText="Category" />
            <asp:BoundField DataField="Price" HeaderText="Price" DataFormatString="{0:C}" />
            <asp:BoundField DataField="StockQuantity" HeaderText="Stock" />
            <asp:TemplateField HeaderText="Actions">
                <ItemTemplate>
                    <asp:LinkButton runat="server" Text="Edit"
                        CommandName="EditProduct" CommandArgument='<%# Eval("Id") %>'
                        OnCommand="ProductCommand" Visible='<%# IsAdmin() %>' />
                </ItemTemplate>
            </asp:TemplateField>
        </Columns>
    </asp:GridView>
</asp:Content>
